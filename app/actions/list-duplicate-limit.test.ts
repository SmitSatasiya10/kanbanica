import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireTaskCapacity: vi.fn(),
  selectQueue: [] as unknown[][],
  inserts: [] as { table: unknown; values: unknown }[],
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: "u1" } })) } },
}));
vi.mock("@/lib/permissions", () => ({
  getWorkspaceMembership: vi.fn(async () => ({ role: "OWNER" })),
}));
vi.mock("@/lib/realtime/refresh", () => ({ refreshWorkspace: vi.fn() }));
vi.mock("@/lib/workspace-limits", () => ({
  requireTaskCapacity: h.requireTaskCapacity,
}));

function selectChain() {
  const rows = h.selectQueue.shift() ?? [];
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "innerJoin", "leftJoin"]) {
    chain[m] = () => chain;
  }
  chain.limit = () => Promise.resolve(rows);
  // biome-ignore lint/suspicious/noThenProperty: mirrors Drizzle's own thenable query builder
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

const tx = {
  select: vi.fn(selectChain),
  insert: vi.fn((table: unknown) => ({
    values: (values: unknown) => {
      h.inserts.push({ table, values });
      return Promise.resolve();
    },
  })),
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(selectChain),
    transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  },
}));

import { duplicateList } from "@/app/actions/list";

const source = {
  id: "l1",
  spaceId: "sp-1",
  name: "Backlog",
  color: null,
  description: null,
};
const mkTask = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  parentTaskId: null,
  statusId: null,
  title: id,
  description: null,
  priority: "NONE",
  reporterId: "u1",
  dueDateStart: null,
  dueDateEnd: null,
  orderIndex: 1000,
  isArchived: false,
  archivedAt: null,
  ...over,
});

// select order in duplicateList: source, statuses, tasks, max(order index)
function seed(tasks: unknown[]) {
  h.selectQueue.push([source], [], tasks, [{ maxIdx: 0 }]);
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.inserts.length = 0;
  h.requireTaskCapacity.mockReset().mockResolvedValue({ seqBase: 10 });
});

describe("duplicateList — task limit", () => {
  it("reserves capacity for every task it will create (incl. subtasks and archived when copied)", async () => {
    seed([
      mkTask("a"),
      mkTask("b", { isArchived: true }),
      mkTask("c", { parentTaskId: "a" }),
    ]);

    const res = await duplicateList("ws-1", "sp-1", "l1", { name: "Copy" });

    expect(res).toHaveProperty("listId");
    expect(h.requireTaskCapacity).toHaveBeenCalledWith(tx, "ws-1", 3);
  });

  it("is rejected whole when the tasks don't fit — no list, status or task rows are inserted", async () => {
    seed([mkTask("a"), mkTask("b")]);
    h.requireTaskCapacity.mockResolvedValue({
      error: "Workspace task limit reached (10).",
      code: "TASK_LIMIT_REACHED",
    });

    const res = await duplicateList("ws-1", "sp-1", "l1", { name: "Copy" });

    expect(res).toMatchObject({ code: "TASK_LIMIT_REACHED" });
    expect(h.inserts).toHaveLength(0);
  });

  it("an empty list needs no capacity and skips the gate", async () => {
    seed([]);

    const res = await duplicateList("ws-1", "sp-1", "l1", { name: "Copy" });

    expect(res).toHaveProperty("listId");
    expect(h.requireTaskCapacity).not.toHaveBeenCalled();
  });

  it("copyTasks=false creates no tasks, so nothing to reserve", async () => {
    h.selectQueue.push([source], [], [{ maxIdx: 0 }]);

    const res = await duplicateList("ws-1", "sp-1", "l1", {
      name: "Copy",
      copyTasks: false,
    });

    expect(res).toHaveProperty("listId");
    expect(h.requireTaskCapacity).not.toHaveBeenCalled();
  });

  it("a list from another space is rejected before any gate", async () => {
    h.selectQueue.push([{ ...source, spaceId: "other-space" }]);

    expect(await duplicateList("ws-1", "sp-1", "l1")).toEqual({
      error: "List not found",
    });
    expect(h.requireTaskCapacity).not.toHaveBeenCalled();
  });
});
