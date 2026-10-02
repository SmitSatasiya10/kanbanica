import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  bulkImportTasks: vi.fn(),
  getWorkspaceCapacity: vi.fn(),
  requireEditAccess: vi.fn(),
  selectQueue: [] as unknown[][],
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: "u1" } })) } },
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const rows = h.selectQueue.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ["from", "where"]) {
        chain[m] = () => chain;
      }
      chain.limit = () => Promise.resolve(rows);
      return chain;
    }),
  },
}));
vi.mock("@/lib/permissions", () => ({
  requireEditAccess: h.requireEditAccess,
}));
vi.mock("@/lib/import-export/bulk-import-tasks", () => ({
  bulkImportTasks: h.bulkImportTasks,
  buildValidationContext: vi.fn(async () => ({
    workspaceId: "ws-1",
    listStatuses: [],
    membersByEmail: new Map(),
    tagNamesLower: new Set(),
    customFields: [],
    existingTasksByRef: new Map(),
    fileRowTitleToIndex: new Map(),
  })),
  buildFileRowTitleIndex: vi.fn(() => new Map()),
}));
vi.mock("@/lib/import-export/validate-row", () => ({
  validateImportRow: vi.fn(async (_r, _m, _c, rowIndex: number) => ({
    rowIndex,
    status: "valid",
    errors: [],
    warnings: [],
    data: { title: `T${rowIndex}` },
  })),
  detectDuplicateRowIndexes: vi.fn(() => new Set()),
  findUnmappedRequiredFields: vi.fn(() => []),
  findUnmappedRequiredFixedFields: vi.fn(() => []),
}));
vi.mock("@/lib/workspace-limits", async (orig) => ({
  ...(await orig<typeof import("@/lib/workspace-limits")>()),
  getWorkspaceCapacity: h.getWorkspaceCapacity,
}));

import { NextRequest } from "next/server";
import { POST as confirm } from "@/app/api/lists/[listId]/import/confirm/route";
import { POST as validate } from "@/app/api/lists/[listId]/import/validate/route";
import { TASK_LIMIT_CODE } from "@/lib/task-limit";

const req = (url: string) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify({
      mapping: { Title: "title" },
      rows: [{ rowIndex: 1, row: { Title: "A" } }],
    }),
  });
const params = { params: Promise.resolve({ listId: "l1" }) };

beforeEach(() => {
  h.selectQueue.length = 0;
  h.selectQueue.push(
    [{ id: "l1", spaceId: "sp-1" }],
    [{ workspaceId: "ws-1" }]
  );
  h.requireEditAccess.mockReset().mockResolvedValue(null);
  h.bulkImportTasks.mockReset();
  h.getWorkspaceCapacity.mockReset();
});

describe("POST /import/confirm", () => {
  it("maps capacity exhaustion to HTTP 409 (not 403)", async () => {
    h.bulkImportTasks.mockResolvedValue({
      error: "Workspace task limit reached (10).",
      code: TASK_LIMIT_CODE,
    });
    const res = await confirm(req("/api/lists/l1/import/confirm"), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("task limit reached");
  });

  it("still maps permission errors to 403", async () => {
    h.bulkImportTasks.mockResolvedValue({ error: "Forbidden" });
    const res = await confirm(req("/api/lists/l1/import/confirm"), params);
    expect(res.status).toBe(403);
  });
});

describe("POST /import/validate", () => {
  it("returns informational capacity {limit, used, remaining}", async () => {
    h.getWorkspaceCapacity.mockResolvedValue({
      limit: 10_000,
      used: 9950,
      remaining: 50,
    });
    const res = await validate(req("/api/lists/l1/import/validate"), params);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.capacity).toEqual({ limit: 10_000, used: 9950, remaining: 50 });
    // Informational only: validation itself still succeeds even if rows exceed capacity.
    expect(json.summary.valid).toBe(1);
  });

  it("unlimited workspace reports null limit/remaining", async () => {
    h.getWorkspaceCapacity.mockResolvedValue({
      limit: null,
      used: 0,
      remaining: null,
    });
    const json = await (
      await validate(req("/api/lists/l1/import/validate"), params)
    ).json();
    expect(json.capacity).toEqual({ limit: null, used: 0, remaining: null });
  });
});
