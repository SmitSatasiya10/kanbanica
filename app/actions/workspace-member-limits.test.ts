import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  membership: vi.fn(),
  refresh: vi.fn(),
  requireMemberCapacity: vi.fn(),
  consumeInviteLinkUse: vi.fn(),
  enqueueEmail: vi.fn(),
  selectQueue: [] as unknown[][],
  txInsert: vi.fn(),
  txUpdate: vi.fn(),
  dbUpdateSet: vi.fn(),
  order: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock("@/lib/permissions", () => ({ getWorkspaceMembership: h.membership }));
vi.mock("@/lib/realtime/refresh", () => ({ refreshWorkspace: h.refresh }));
vi.mock("@/lib/email", () => ({ enqueueEmail: h.enqueueEmail }));
vi.mock("@/lib/email/templates/workspace-invite", () => ({
  workspaceInviteTemplate: vi.fn(async () => ({ html: "h", text: "t" })),
}));
vi.mock("@/lib/notifications/create-notification", () => ({
  createNotifications: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost", NODE_ENV: "test" },
}));
vi.mock("@/lib/invite-link-server", () => ({
  consumeInviteLinkUse: h.consumeInviteLinkUse,
}));
vi.mock("@/lib/workspace-limits", () => ({
  requireMemberCapacity: h.requireMemberCapacity,
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

function updateChain(record: (v: unknown) => void) {
  return {
    set: (v: unknown) => {
      record(v);
      const where: Record<string, unknown> = {
        returning: () => Promise.resolve([{ email: "x@y.io" }]),
      };
      // biome-ignore lint/suspicious/noThenProperty: awaitable like Drizzle's builder
      where.then = (r: (v: unknown) => unknown) => Promise.resolve().then(r);
      return { where: () => where };
    },
  };
}

const tx = {
  select: vi.fn(selectChain),
  insert: vi.fn(() => ({
    values: (v: unknown) => {
      h.txInsert(v);
      h.order.push("insert");
      return Promise.resolve();
    },
  })),
  update: vi.fn(() =>
    updateChain((v) => {
      h.txUpdate(v);
      h.order.push("update");
    })
  ),
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(selectChain),
    update: vi.fn(() => updateChain((v) => h.dbUpdateSet(v))),
    transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  },
}));

import {
  acceptInvite,
  changeMemberRole,
  inviteMember,
  joinViaLink,
  resendInvite,
  updateWorkspaceMemberLimits,
} from "@/app/actions/workspace";

const FULL = {
  error: "This workspace has reached its member limit (10).",
  code: "MEMBER_LIMIT_REACHED",
};

beforeEach(() => {
  h.selectQueue.length = 0;
  h.order.length = 0;
  for (const m of [
    h.txInsert,
    h.txUpdate,
    h.dbUpdateSet,
    h.refresh,
    h.enqueueEmail,
  ]) {
    m.mockReset();
  }
  h.getSession.mockReset().mockResolvedValue({
    user: { id: "u1", email: "me@x.io", name: "Me" },
  });
  h.membership.mockReset().mockResolvedValue({ role: "OWNER" });
  h.consumeInviteLinkUse.mockReset().mockImplementation(async () => {
    h.order.push("consume");
    return null;
  });
  h.requireMemberCapacity.mockReset().mockImplementation(async () => {
    h.order.push("gate");
    return null;
  });
});

describe("updateWorkspaceMemberLimits", () => {
  it.each(["OWNER", "ADMIN"])(
    "%s can set limits and the workspace refreshes",
    async (role) => {
      h.membership.mockResolvedValue({ role });
      const res = await updateWorkspaceMemberLimits({
        workspaceId: "ws-1",
        maxMembers: 25,
        maxGuests: 5,
      });
      expect(res).toEqual({ ok: true });
      expect(h.dbUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ maxMembers: 25, maxGuests: 5 })
      );
      expect(h.refresh).toHaveBeenCalledWith("ws-1");
    }
  );

  it.each(["MEMBER", "GUEST", null])(
    "%s is rejected and nothing is written",
    async (role) => {
      h.membership.mockResolvedValue(role ? { role } : null);
      const res = await updateWorkspaceMemberLimits({
        workspaceId: "ws-1",
        maxMembers: 5,
        maxGuests: 1,
      });
      expect(res).toEqual({ error: "Only admins can change member limits" });
      expect(h.dbUpdateSet).not.toHaveBeenCalled();
    }
  );

  it("unauthenticated callers are rejected", async () => {
    h.getSession.mockResolvedValue(null);
    expect(
      await updateWorkspaceMemberLimits({
        workspaceId: "ws-1",
        maxMembers: 5,
        maxGuests: 1,
      })
    ).toEqual({ error: "Unauthorized" });
  });

  it("null means unlimited for either bucket", async () => {
    expect(
      await updateWorkspaceMemberLimits({
        workspaceId: "ws-1",
        maxMembers: null,
        maxGuests: null,
      })
    ).toEqual({ ok: true });
    expect(h.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ maxMembers: null, maxGuests: null })
    );
  });

  it("guest limit 0 (no guests) is valid; member limit 0 is not", async () => {
    expect(
      await updateWorkspaceMemberLimits({
        workspaceId: "ws-1",
        maxMembers: 5,
        maxGuests: 0,
      })
    ).toEqual({ ok: true });
    h.dbUpdateSet.mockReset();
    expect(
      await updateWorkspaceMemberLimits({
        workspaceId: "ws-1",
        maxMembers: 0,
        maxGuests: null,
      })
    ).toHaveProperty("error");
    expect(h.dbUpdateSet).not.toHaveBeenCalled();
  });

  it.each([
    [-1, null],
    [1.5, null],
    [100_001, null],
    [Number.NaN, null],
    [null, -1],
    [null, 0.5],
    [null, 100_001],
  ])(
    "rejects invalid values (%p, %p) without writing",
    async (maxMembers, maxGuests) => {
      const res = await updateWorkspaceMemberLimits({
        workspaceId: "ws-1",
        maxMembers,
        maxGuests,
      });
      expect(res).toHaveProperty("error");
      expect(h.dbUpdateSet).not.toHaveBeenCalled();
      expect(h.refresh).not.toHaveBeenCalled();
    }
  );

  it("lowering below usage is allowed — only limits (+updatedAt) are written", async () => {
    await updateWorkspaceMemberLimits({
      workspaceId: "ws-1",
      maxMembers: 2,
      maxGuests: 0,
    });
    expect(Object.keys(h.dbUpdateSet.mock.calls[0][0]).sort()).toEqual([
      "maxGuests",
      "maxMembers",
      "updatedAt",
    ]);
  });
});

describe("inviteMember", () => {
  const invite = (role: "ADMIN" | "MEMBER" | "GUEST") =>
    inviteMember({ workspaceId: "ws-1", email: "New@X.io", role });

  it("rejected at the limit: nothing inserted, no email sent", async () => {
    h.requireMemberCapacity.mockResolvedValue(FULL);
    expect(await invite("MEMBER")).toEqual(FULL);
    expect(h.txInsert).not.toHaveBeenCalled();
    expect(h.enqueueEmail).not.toHaveBeenCalled();
  });

  it("gates inside the transaction before the insert; email only after", async () => {
    h.selectQueue.push([], [{ name: "WS" }], []); // dup check, ws name, invitee lookup
    expect(await invite("MEMBER")).toEqual({ ok: true });
    expect(h.requireMemberCapacity).toHaveBeenCalledWith(tx, "ws-1", "members");
    expect(h.order).toEqual(["gate", "insert"]);
    expect(h.txInsert.mock.calls[0][0]).toMatchObject({
      status: "INVITED",
      email: "new@x.io",
      role: "MEMBER",
    });
    expect(h.enqueueEmail).toHaveBeenCalled();
  });

  it.each([
    ["GUEST", "guests"],
    ["MEMBER", "members"],
    ["ADMIN", "members"],
  ] as const)("%s invite uses the %s bucket", async (role, bucket) => {
    h.selectQueue.push([], [{ name: "WS" }], []);
    await invite(role);
    expect(h.requireMemberCapacity).toHaveBeenCalledWith(tx, "ws-1", bucket);
  });

  it("duplicate check runs inside the transaction (after the gate) and blocks the insert", async () => {
    h.selectQueue.push([{ id: "existing" }]);
    expect(await invite("MEMBER")).toEqual({
      error: "This email is already a member or has a pending invite",
    });
    expect(h.txInsert).not.toHaveBeenCalled();
  });
});

describe("joinViaLink", () => {
  it("rejected when the bucket is full: no row inserted", async () => {
    h.selectQueue.push([{ id: "ws-1", inviteLinkRole: "MEMBER" }], []);
    h.requireMemberCapacity.mockResolvedValue(FULL);
    expect(await joinViaLink("tok")).toEqual(FULL);
    expect(h.txInsert).not.toHaveBeenCalled();
  });

  it("an existing active member still gets the idempotent success when the workspace is full", async () => {
    h.selectQueue.push(
      [{ id: "ws-1", inviteLinkRole: "MEMBER" }],
      [{ id: "m1" }]
    );
    h.requireMemberCapacity.mockResolvedValue(FULL);
    expect(await joinViaLink("tok")).toEqual({ workspaceId: "ws-1" });
    expect(h.requireMemberCapacity).not.toHaveBeenCalled();
  });

  it.each([
    ["GUEST", "guests"],
    ["MEMBER", "members"],
  ] as const)(
    "link role %s gates the %s bucket, then inserts ACTIVE",
    async (linkRole, bucket) => {
      h.selectQueue.push([{ id: "ws-1", inviteLinkRole: linkRole }], []);
      expect(await joinViaLink("tok")).toEqual({ workspaceId: "ws-1" });
      expect(h.requireMemberCapacity).toHaveBeenCalledWith(tx, "ws-1", bucket);
      expect(h.order).toEqual(["gate", "consume", "insert"]);
      expect(h.txInsert.mock.calls[0][0]).toMatchObject({
        status: "ACTIVE",
        role: linkRole,
      });
    }
  );
});

describe("resendInvite", () => {
  const past = new Date(Date.now() - 86_400_000);
  const future = new Date(Date.now() + 86_400_000);

  it("expired invite: revival is gated, and blocked when full (no update)", async () => {
    h.selectQueue.push([
      { role: "GUEST", status: "INVITED", inviteExpiresAt: past },
    ]);
    h.requireMemberCapacity.mockResolvedValue(FULL);
    expect(await resendInvite({ workspaceId: "ws-1", memberId: "m1" })).toEqual(
      FULL
    );
    expect(h.requireMemberCapacity).toHaveBeenCalledWith(tx, "ws-1", "guests");
    expect(h.txUpdate).not.toHaveBeenCalled();
  });

  it("expired invite with room: gated then updated in the transaction", async () => {
    h.selectQueue.push(
      [{ role: "MEMBER", status: "INVITED", inviteExpiresAt: past }],
      [{ name: "WS" }]
    );
    await resendInvite({ workspaceId: "ws-1", memberId: "m1" });
    expect(h.order.slice(0, 2)).toEqual(["gate", "update"]);
  });

  it("unexpired invite already holds a seat: no gate, plain update", async () => {
    h.selectQueue.push(
      [{ role: "MEMBER", status: "INVITED", inviteExpiresAt: future }],
      [{ name: "WS" }]
    );
    await resendInvite({ workspaceId: "ws-1", memberId: "m1" });
    expect(h.requireMemberCapacity).not.toHaveBeenCalled();
    expect(h.dbUpdateSet).toHaveBeenCalled();
  });
});

describe("changeMemberRole", () => {
  const target = (role: string) => [[{ role, userId: "u2" }]];

  it("GUEST -> MEMBER takes a member seat (gated, destination bucket)", async () => {
    h.selectQueue.push(...target("GUEST"));
    expect(
      await changeMemberRole({
        workspaceId: "ws-1",
        memberId: "m1",
        role: "MEMBER",
      })
    ).toEqual({ ok: true });
    expect(h.requireMemberCapacity).toHaveBeenCalledWith(tx, "ws-1", "members");
    expect(h.order).toEqual(["gate", "update"]);
  });

  it("MEMBER -> GUEST takes a guest seat (gated, destination bucket)", async () => {
    h.selectQueue.push(...target("MEMBER"));
    await changeMemberRole({
      workspaceId: "ws-1",
      memberId: "m1",
      role: "GUEST",
    });
    expect(h.requireMemberCapacity).toHaveBeenCalledWith(tx, "ws-1", "guests");
  });

  it("MEMBER -> ADMIN stays in the member bucket: not gated", async () => {
    h.selectQueue.push(...target("MEMBER"));
    await changeMemberRole({
      workspaceId: "ws-1",
      memberId: "m1",
      role: "ADMIN",
    });
    expect(h.requireMemberCapacity).not.toHaveBeenCalled();
    expect(h.txUpdate).toHaveBeenCalled();
  });

  it("blocked when the destination bucket is full: role is not changed", async () => {
    h.selectQueue.push(...target("GUEST"));
    h.requireMemberCapacity.mockResolvedValue(FULL);
    expect(
      await changeMemberRole({
        workspaceId: "ws-1",
        memberId: "m1",
        role: "MEMBER",
      })
    ).toEqual(FULL);
    expect(h.txUpdate).not.toHaveBeenCalled();
  });
});

describe("acceptInvite — seat already reserved by the pending invite", () => {
  it("never consults the capacity gate, even at/over the limit", async () => {
    h.selectQueue.push([
      {
        id: "m1",
        workspaceId: "ws-1",
        status: "INVITED",
        userId: null,
        email: "me@x.io",
        inviteExpiresAt: new Date(Date.now() + 86_400_000),
        invitedBy: null,
      },
    ]);
    h.requireMemberCapacity.mockResolvedValue(FULL);
    expect(await acceptInvite("tok")).toEqual({ workspaceId: "ws-1" });
    expect(h.requireMemberCapacity).not.toHaveBeenCalled();
  });
});
