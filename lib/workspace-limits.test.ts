import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { select: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  getWorkspaceCapacity,
  getWorkspaceMemberCapacity,
  getWorkspaceMemberUsage,
  getWorkspaceTaskUsage,
  requireMemberCapacity,
  requireTaskCapacity,
  TASK_LIMIT_CODE,
  taskLimitReachedMessage,
} from "@/lib/workspace-limits";

// A recording transaction: every select/update is logged in call order so tests
// can assert lock → count → seq-reserve ordering. Select results are queued.
function makeTx(selectResults: unknown[][]) {
  const calls: string[] = [];
  const queue = [...selectResults];
  const tx = {
    select: vi.fn(() => {
      const rows = queue.shift() ?? [];
      let kind = "select";
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(rows),
        for: (mode: string) => {
          kind = `select-for-${mode}`;
          calls.push(kind);
          return Promise.resolve(rows);
        },
        // biome-ignore lint/suspicious/noThenProperty: mirrors Drizzle's own thenable query builder
        then: (resolve: (v: unknown) => unknown) => {
          calls.push("count");
          return Promise.resolve(rows).then(resolve);
        },
      };
      return chain;
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => {
          calls.push("update-seq");
          return Promise.resolve();
        }),
      })),
    })),
  };
  return { tx: tx as never, calls, raw: tx };
}

beforeEach(() => {
  dbMock.select.mockReset();
});

describe("requireTaskCapacity", () => {
  it("unlimited workspace: skips the count query and reserves the seq", async () => {
    const { tx, calls, raw } = makeTx([[{ maxTasks: null, taskSeq: 7 }]]);

    const result = await requireTaskCapacity(tx, "ws-1", 3);

    expect(result).toEqual({ seqBase: 7 });
    expect(calls).toEqual(["select-for-update", "update-seq"]);
    expect(raw.select).toHaveBeenCalledTimes(1); // no count select
  });

  it("locks the workspace row BEFORE counting and counting BEFORE reserving seq", async () => {
    const { tx, calls } = makeTx([
      [{ maxTasks: 100, taskSeq: 50 }],
      [{ value: 10 }],
    ]);

    await requireTaskCapacity(tx, "ws-1", 1);

    expect(calls).toEqual(["select-for-update", "count", "update-seq"]);
  });

  it("allows creation below the limit", async () => {
    const { tx } = makeTx([[{ maxTasks: 100, taskSeq: 5 }], [{ value: 50 }]]);
    expect(await requireTaskCapacity(tx, "ws-1", 1)).toEqual({ seqBase: 5 });
  });

  it("allows a batch that exactly fills the remaining capacity", async () => {
    const { tx } = makeTx([[{ maxTasks: 100, taskSeq: 5 }], [{ value: 95 }]]);
    expect(await requireTaskCapacity(tx, "ws-1", 5)).toEqual({ seqBase: 5 });
  });

  it("rejects when already at the limit", async () => {
    const { tx } = makeTx([[{ maxTasks: 100, taskSeq: 5 }], [{ value: 100 }]]);
    expect(await requireTaskCapacity(tx, "ws-1", 1)).toEqual({
      error: taskLimitReachedMessage(100),
      code: TASK_LIMIT_CODE,
    });
  });

  it("rejects when used is already over the limit (limit lowered below usage)", async () => {
    const { tx } = makeTx([
      [{ maxTasks: 5000, taskSeq: 5 }],
      [{ value: 8000 }],
    ]);
    const result = await requireTaskCapacity(tx, "ws-1", 1);
    expect(result).toMatchObject({ code: TASK_LIMIT_CODE });
  });

  it("is all-or-nothing: a 10-task batch with 5 slots left is rejected whole", async () => {
    const { tx } = makeTx([[{ maxTasks: 100, taskSeq: 5 }], [{ value: 95 }]]);
    expect(await requireTaskCapacity(tx, "ws-1", 10)).toMatchObject({
      code: TASK_LIMIT_CODE,
    });
  });

  it("does NOT reserve (burn) sequence numbers when capacity is rejected", async () => {
    const { tx, calls, raw } = makeTx([
      [{ maxTasks: 10, taskSeq: 99 }],
      [{ value: 10 }],
    ]);

    await requireTaskCapacity(tx, "ws-1", 1);

    expect(raw.update).not.toHaveBeenCalled();
    expect(calls).not.toContain("update-seq");
  });

  it("errors (without reserving) when the workspace does not exist", async () => {
    const { tx, raw } = makeTx([[]]);
    expect(await requireTaskCapacity(tx, "missing", 1)).toEqual({
      error: "Workspace not found",
    });
    expect(raw.update).not.toHaveBeenCalled();
  });
});

describe("getWorkspaceTaskUsage", () => {
  it("returns the row count (archived, completed and subtask rows are all plain task rows)", async () => {
    const { tx } = makeTx([[{ value: 6284 }]]);
    expect(await getWorkspaceTaskUsage("ws-1", tx)).toBe(6284);
  });

  it("uses the module db when no transaction is given", async () => {
    const { tx } = makeTx([[{ value: 3 }]]);
    dbMock.select.mockImplementation((tx as { select: () => unknown }).select);
    expect(await getWorkspaceTaskUsage("ws-1")).toBe(3);
  });
});

describe("getWorkspaceCapacity", () => {
  function queueDb(results: unknown[][]) {
    const { tx } = makeTx(results);
    dbMock.select.mockImplementation((tx as { select: () => unknown }).select);
  }

  it("unlimited (null limit, as for existing workspaces after migration): no count query", async () => {
    queueDb([[{ maxTasks: null }]]);
    expect(await getWorkspaceCapacity("ws-1")).toEqual({
      limit: null,
      used: 0,
      remaining: null,
    });
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it("limit configured: reports used and remaining", async () => {
    queueDb([[{ maxTasks: 10_000 }], [{ value: 6284 }]]);
    expect(await getWorkspaceCapacity("ws-1")).toEqual({
      limit: 10_000,
      used: 6284,
      remaining: 3716,
    });
  });

  it("never reports negative remaining when usage exceeds a lowered limit", async () => {
    queueDb([[{ maxTasks: 5000 }], [{ value: 8000 }]]);
    expect((await getWorkspaceCapacity("ws-1")).remaining).toBe(0);
  });
});

describe("usage counting rules (rendered SQL)", () => {
  it("counts every task row by workspaceId only — archived, completed, subtasks and orphans all count; deleted rows are simply gone", async () => {
    let whereArg: unknown;
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: (w: unknown) => {
        whereArg = w;
        return Promise.resolve([{ value: 1 }]);
      },
    };
    await getWorkspaceTaskUsage("ws-1", { select: () => chain } as never);

    const { sql, params } = new PgDialect().sqlToQuery(whereArg as never);
    expect(sql).toBe('"task"."workspace_id" = $1');
    expect(params).toEqual(["ws-1"]);
    expect(sql).not.toMatch(/is_archived|parent_task_id|status_id/);
  });
});

describe("requireMemberCapacity", () => {
  const ws = (maxMembers: number | null, maxGuests: number | null) => [
    { maxMembers, maxGuests },
  ];

  it("unlimited bucket: allows without running the count query", async () => {
    const { tx, calls } = makeTx([ws(null, 5)]);
    expect(await requireMemberCapacity(tx, "ws-1", "members")).toBeNull();
    expect(calls).toEqual(["select-for-update"]);
  });

  it("locks the workspace row BEFORE counting", async () => {
    const { tx, calls } = makeTx([ws(10, null), [{ members: 3, guests: 0 }]]);
    await requireMemberCapacity(tx, "ws-1", "members");
    expect(calls).toEqual(["select-for-update", "count"]);
  });

  it("allows below the limit and exactly filling the last seat", async () => {
    expect(
      await requireMemberCapacity(
        makeTx([ws(10, null), [{ members: 9, guests: 0 }]]).tx,
        "ws-1",
        "members"
      )
    ).toBeNull();
  });

  it("rejects a member when members are full, with the member code", async () => {
    const { tx } = makeTx([ws(10, null), [{ members: 10, guests: 0 }]]);
    expect(await requireMemberCapacity(tx, "ws-1", "members")).toMatchObject({
      code: "MEMBER_LIMIT_REACHED",
    });
  });

  it("buckets are independent: full members don't block guests and vice versa", async () => {
    const usage = [{ members: 10, guests: 1 }];
    expect(
      await requireMemberCapacity(
        makeTx([ws(10, 5), usage]).tx,
        "ws-1",
        "guests"
      )
    ).toBeNull();
    expect(
      await requireMemberCapacity(
        makeTx([ws(50, 1), usage]).tx,
        "ws-1",
        "guests"
      )
    ).toMatchObject({ code: "GUEST_LIMIT_REACHED" });
  });

  it("guest limit 0 disallows guests entirely", async () => {
    const { tx } = makeTx([ws(null, 0), [{ members: 4, guests: 0 }]]);
    expect(await requireMemberCapacity(tx, "ws-1", "guests")).toMatchObject({
      code: "GUEST_LIMIT_REACHED",
    });
  });

  it("rejects when usage is already over a lowered limit", async () => {
    const { tx } = makeTx([ws(5, null), [{ members: 8, guests: 0 }]]);
    expect(await requireMemberCapacity(tx, "ws-1", "members")).toMatchObject({
      code: "MEMBER_LIMIT_REACHED",
    });
  });

  it("writes nothing (no update) whether allowed or rejected", async () => {
    const a = makeTx([ws(10, null), [{ members: 10, guests: 0 }]]);
    await requireMemberCapacity(a.tx, "ws-1", "members");
    expect(a.raw.update).not.toHaveBeenCalled();
  });

  it("errors when the workspace does not exist", async () => {
    expect(
      await requireMemberCapacity(makeTx([[]]).tx, "missing", "members")
    ).toEqual({ error: "Workspace not found" });
  });
});

describe("getWorkspaceMemberUsage (rendered SQL)", () => {
  it("counts ACTIVE plus unexpired INVITED rows only, split members/guests", async () => {
    let whereArg: unknown;
    let selection: unknown;
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: (w: unknown) => {
        whereArg = w;
        return Promise.resolve([{ members: "7", guests: "2" }]);
      },
    };
    const usage = await getWorkspaceMemberUsage("ws-1", {
      select: (sel: unknown) => {
        selection = sel;
        return chain;
      },
    } as never);

    expect(usage).toEqual({ members: 7, guests: 2 });
    const dialect = new PgDialect();
    const where = dialect.sqlToQuery(whereArg as never);
    expect(where.sql).toContain('"workspace_member"."workspace_id" = $1');
    expect(where.sql).toContain('"workspace_member"."status" = $2');
    expect(where.sql).toContain(
      '"workspace_member"."invite_expires_at" is null'
    );
    expect(where.sql).toContain('"workspace_member"."invite_expires_at" >');
    expect(where.params.slice(0, 3)).toEqual(["ws-1", "ACTIVE", "INVITED"]);
    const sel = selection as { members: never; guests: never };
    expect(dialect.sqlToQuery(sel.members).sql).toContain("<> 'GUEST'");
    expect(dialect.sqlToQuery(sel.guests).sql).toContain("= 'GUEST'");
  });
});

describe("getWorkspaceMemberCapacity", () => {
  it("reports per-bucket limit/used/remaining; null limit -> null remaining", async () => {
    const { tx } = makeTx([
      [{ maxMembers: 15, maxGuests: null }],
      [{ members: 12, guests: 3 }],
    ]);
    dbMock.select.mockImplementation((tx as { select: () => unknown }).select);
    expect(await getWorkspaceMemberCapacity("ws-1")).toEqual({
      members: { limit: 15, used: 12, remaining: 3 },
      guests: { limit: null, used: 3, remaining: null },
    });
  });
});
