import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireEditAccess: vi.fn(),
  getWorkspaceCapacity: vi.fn(),
  requireTaskCapacity: vi.fn(),
  findOrCreateTagsByNames: vi.fn(),
  validateImportRow: vi.fn(),
  txInsert: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  requireEditAccess: h.requireEditAccess,
}));
vi.mock("@/app/actions/custom-field", () => ({
  getCustomFieldDefinitions: vi.fn(async () => []),
}));
vi.mock("@/app/actions/space", () => ({
  spaceRecipientUserIds: vi.fn(async () => []),
}));
vi.mock("@/app/actions/task-tag", () => ({
  findOrCreateTagsByNames: h.findOrCreateTagsByNames,
}));
vi.mock("@/lib/activity-log", () => ({ writeActivityLogBulk: vi.fn() }));
vi.mock("@/lib/realtime/refresh", () => ({ refreshWorkspace: vi.fn() }));
vi.mock("@/lib/notifications/create-bulk-notifications", () => ({
  createBulkNotifications: vi.fn(),
}));
vi.mock("@/lib/workspace-limits", async (orig) => ({
  ...(await orig<typeof import("@/lib/workspace-limits")>()),
  getWorkspaceCapacity: h.getWorkspaceCapacity,
  requireTaskCapacity: h.requireTaskCapacity,
}));
vi.mock("@/lib/import-export/validate-row", async (orig) => ({
  ...(await orig<typeof import("@/lib/import-export/validate-row")>()),
  validateImportRow: h.validateImportRow,
}));

function emptySelect() {
  const chain: Record<string, unknown> = {};
  for (const m of [
    "from",
    "where",
    "innerJoin",
    "leftJoin",
    "orderBy",
    "limit",
  ]) {
    chain[m] = () => chain;
  }
  // biome-ignore lint/suspicious/noThenProperty: mirrors Drizzle's own thenable query builder
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve([]).then(resolve);
  return chain;
}
const tx = {
  insert: vi.fn(() => ({
    values: (v: unknown) => {
      h.txInsert(v);
      return { onConflictDoNothing: () => Promise.resolve() };
    },
  })),
};
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(emptySelect),
    transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  },
}));

import { db } from "@/lib/db";
import { bulkImportTasks } from "@/lib/import-export/bulk-import-tasks";
import { TASK_LIMIT_CODE } from "@/lib/task-limit";

const target = { workspaceId: "ws-1", spaceId: "sp-1", listId: "l-1" };
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    rowIndex: i + 1,
    row: { Title: `Task ${i + 1}` },
  }));

beforeEach(() => {
  h.requireEditAccess.mockReset().mockResolvedValue(null);
  h.getWorkspaceCapacity
    .mockReset()
    .mockResolvedValue({ limit: null, used: 0, remaining: null });
  h.requireTaskCapacity.mockReset().mockResolvedValue({ seqBase: 100 });
  h.findOrCreateTagsByNames.mockReset().mockResolvedValue(new Map());
  h.txInsert.mockReset();
  vi.mocked(db.transaction).mockClear();
  h.validateImportRow
    .mockReset()
    .mockImplementation(async (_r, _m, _c, rowIndex: number) => ({
      rowIndex,
      status: "valid",
      errors: [],
      warnings: [],
      data: {
        title: `Task ${rowIndex}`,
        description: "",
        priority: "NONE",
        statusId: null,
        assigneeIds: [],
        tagNames: [],
        customFieldValues: {},
        dueDateStart: null,
        dueDateEnd: null,
        parentRef: null,
      },
    }));
});

describe("bulkImportTasks — workspace task limit", () => {
  it("unlimited workspace: imports and reserves capacity for exactly the surviving rows", async () => {
    const res = await bulkImportTasks(
      "u1",
      target,
      { Title: "title" },
      rows(3)
    );

    expect(res).toMatchObject({ successCount: 3 });
    expect(h.requireTaskCapacity).toHaveBeenCalledWith(tx, "ws-1", 3);
    const inserted = h.txInsert.mock.calls[0][0] as { seqNumber: number }[];
    expect(inserted.map((r) => r.seqNumber)).toEqual([101, 102, 103]);
  });

  it("exactly fills remaining capacity → allowed", async () => {
    h.getWorkspaceCapacity.mockResolvedValue({
      limit: 10_000,
      used: 9997,
      remaining: 3,
    });
    const res = await bulkImportTasks(
      "u1",
      target,
      { Title: "title" },
      rows(3)
    );
    expect(res).toMatchObject({ successCount: 3 });
  });

  it("more rows than remaining capacity → rejected whole with the limit code; nothing inserted, no tags created", async () => {
    h.getWorkspaceCapacity.mockResolvedValue({
      limit: 10_000,
      used: 9950,
      remaining: 50,
    });

    const res = await bulkImportTasks(
      "u1",
      target,
      { Title: "title" },
      rows(100)
    );

    expect(res).toMatchObject({ code: TASK_LIMIT_CODE });
    expect(h.findOrCreateTagsByNames).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(h.txInsert).not.toHaveBeenCalled();
  });

  it("race: the early check passes but the locked in-transaction gate rejects → nothing inserted", async () => {
    h.getWorkspaceCapacity.mockResolvedValue({
      limit: 10,
      used: 5,
      remaining: 5,
    });
    h.requireTaskCapacity.mockResolvedValue({
      error: "Workspace task limit reached (10).",
      code: TASK_LIMIT_CODE,
    });

    const res = await bulkImportTasks(
      "u1",
      target,
      { Title: "title" },
      rows(5)
    );

    expect(res).toMatchObject({ code: TASK_LIMIT_CODE });
    expect(h.txInsert).not.toHaveBeenCalled();
  });

  it("row-level invalid rows don't consume capacity (only survivors are counted)", async () => {
    h.validateImportRow.mockImplementation(
      async (_r, _m, _c, rowIndex: number) =>
        rowIndex === 2
          ? {
              rowIndex,
              status: "invalid",
              errors: ["bad"],
              warnings: [],
              data: null,
            }
          : {
              rowIndex,
              status: "valid",
              errors: [],
              warnings: [],
              data: {
                title: `Task ${rowIndex}`,
                description: "",
                priority: "NONE",
                statusId: null,
                assigneeIds: [],
                tagNames: [],
                customFieldValues: {},
                dueDateStart: null,
                dueDateEnd: null,
                parentRef: null,
              },
            }
    );
    h.getWorkspaceCapacity.mockResolvedValue({
      limit: 100,
      used: 98,
      remaining: 2,
    });

    const res = await bulkImportTasks(
      "u1",
      target,
      { Title: "title" },
      rows(3)
    );

    expect(res).toMatchObject({ successCount: 2 });
    expect(h.requireTaskCapacity).toHaveBeenCalledWith(tx, "ws-1", 2);
  });
});
