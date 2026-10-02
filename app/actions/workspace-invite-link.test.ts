import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  membership: vi.fn(),
  refresh: vi.fn(),
  requireMemberCapacity: vi.fn(),
  consumeInviteLinkUse: vi.fn(),
  selectQueue: [] as unknown[][],
  txInsert: vi.fn(),
  dbSet: vi.fn(),
  order: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock("@/lib/permissions", () => ({ getWorkspaceMembership: h.membership }));
vi.mock("@/lib/realtime/refresh", () => ({ refreshWorkspace: h.refresh }));
vi.mock("@/lib/email", () => ({ enqueueEmail: vi.fn() }));
vi.mock("@/lib/email/templates/workspace-invite", () => ({
  workspaceInviteTemplate: vi.fn(),
}));
vi.mock("@/lib/notifications/create-notification", () => ({
  createNotifications: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "http://localhost" } }));
vi.mock("@/lib/workspace-limits", () => ({
  requireMemberCapacity: h.requireMemberCapacity,
}));
vi.mock("@/lib/invite-link-server", () => ({
  consumeInviteLinkUse: h.consumeInviteLinkUse,
}));

function selectChain() {
  const rows = h.selectQueue.shift() ?? [];
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy"]) {
    chain[m] = () => chain;
  }
  chain.limit = () => Promise.resolve(rows);
  // biome-ignore lint/suspicious/noThenProperty: mirrors Drizzle's own thenable query builder
  chain.then = (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r);
  return chain;
}

const tx = {
  insert: vi.fn(() => ({
    values: (v: unknown) => {
      h.txInsert(v);
      h.order.push("insert");
      return Promise.resolve();
    },
  })),
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(selectChain),
    update: vi.fn(() => ({
      set: (v: unknown) => {
        h.dbSet(v);
        return { where: () => Promise.resolve() };
      },
    })),
    transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  },
}));

import {
  disableInviteLink,
  joinViaLink,
  regenerateInviteLink,
  setInviteLinkRole,
  updateInviteLinkSettings,
} from "@/app/actions/workspace";

const EXPIRED = {
  error: "This invite link has expired.",
  code: "INVITE_LINK_EXPIRED",
};
const EXHAUSTED = {
  error: "This invite link has reached its maximum number of uses.",
  code: "INVITE_LINK_EXHAUSTED",
};

beforeEach(() => {
  h.selectQueue.length = 0;
  h.order.length = 0;
  for (const m of [h.txInsert, h.dbSet, h.refresh]) {
    m.mockReset();
  }
  h.getSession.mockReset().mockResolvedValue({
    user: { id: "u1", email: "me@x.io" },
  });
  h.membership.mockReset().mockResolvedValue({ role: "OWNER" });
  h.requireMemberCapacity.mockReset().mockImplementation(async () => {
    h.order.push("gate");
    return null;
  });
  h.consumeInviteLinkUse.mockReset().mockImplementation(async () => {
    h.order.push("consume");
    return null;
  });
});

describe("joinViaLink — expiry and max uses", () => {
  const link = () =>
    h.selectQueue.push([{ id: "ws-1", inviteLinkRole: "MEMBER" }], []);

  it("valid link: gate → consume → insert, in that order, consuming once", async () => {
    link();
    expect(await joinViaLink("tok")).toEqual({ workspaceId: "ws-1" });
    expect(h.order).toEqual(["gate", "consume", "insert"]);
    expect(h.consumeInviteLinkUse).toHaveBeenCalledTimes(1);
    expect(h.consumeInviteLinkUse).toHaveBeenCalledWith(tx, "ws-1", "tok");
  });

  it.each([
    ["expired", EXPIRED],
    ["exhausted", EXHAUSTED],
  ])(
    "%s link: rejected with the code and nothing inserted",
    async (_n, err) => {
      link();
      h.consumeInviteLinkUse.mockResolvedValue(err);
      expect(await joinViaLink("tok")).toEqual(err);
      expect(h.txInsert).not.toHaveBeenCalled();
    }
  );

  it("a full workspace never consumes a use (capacity gate runs first)", async () => {
    link();
    h.requireMemberCapacity.mockResolvedValue({
      error: "full",
      code: "MEMBER_LIMIT_REACHED",
    });
    expect(await joinViaLink("tok")).toMatchObject({
      code: "MEMBER_LIMIT_REACHED",
    });
    expect(h.consumeInviteLinkUse).not.toHaveBeenCalled();
    expect(h.txInsert).not.toHaveBeenCalled();
  });

  it("an existing member is routed in without consuming a use, even if the link is dead", async () => {
    h.selectQueue.push(
      [{ id: "ws-1", inviteLinkRole: "MEMBER" }],
      [{ id: "m1" }]
    );
    h.consumeInviteLinkUse.mockResolvedValue(EXHAUSTED);
    expect(await joinViaLink("tok")).toEqual({ workspaceId: "ws-1" });
    expect(h.consumeInviteLinkUse).not.toHaveBeenCalled();
  });
});

describe("updateInviteLinkSettings", () => {
  const withToken = () => h.selectQueue.push([{ token: "tok" }]);
  const call = (
    over: Partial<Parameters<typeof updateInviteLinkSettings>[0]> = {}
  ) =>
    updateInviteLinkSettings({
      workspaceId: "ws-1",
      expiresInDays: 7,
      maxUses: 10,
      ...over,
    });

  it.each(["OWNER", "ADMIN"])(
    "%s can update; workspace refreshes",
    async (role) => {
      h.membership.mockResolvedValue({ role });
      withToken();
      expect(await call()).toEqual({ ok: true });
      const set = h.dbSet.mock.calls[0][0];
      expect(set.inviteLinkMaxUses).toBe(10);
      expect(set.inviteLinkExpiresAt).toBeInstanceOf(Date);
      expect(h.refresh).toHaveBeenCalledWith("ws-1");
    }
  );

  it.each(["MEMBER", "GUEST", null])(
    "%s is rejected, nothing written",
    async (role) => {
      h.membership.mockResolvedValue(role ? { role } : null);
      expect(await call()).toEqual({
        error: "Only owners and admins can manage the invite link",
      });
      expect(h.dbSet).not.toHaveBeenCalled();
    }
  );

  it("unauthenticated is rejected", async () => {
    h.getSession.mockResolvedValue(null);
    expect(await call()).toEqual({ error: "Unauthorized" });
  });

  it("expiry 7 days sets roughly now + 7d; null clears; 'keep' leaves it out of the update", async () => {
    withToken();
    const before = Date.now();
    await call({ expiresInDays: 7 });
    const at = (h.dbSet.mock.calls[0][0].inviteLinkExpiresAt as Date).getTime();
    expect(at - before).toBeGreaterThan(7 * 86_400_000 - 5000);
    expect(at - before).toBeLessThan(7 * 86_400_000 + 5000);

    withToken();
    await call({ expiresInDays: null });
    expect(h.dbSet.mock.calls[1][0].inviteLinkExpiresAt).toBeNull();

    withToken();
    await call({ expiresInDays: "keep" });
    expect(h.dbSet.mock.calls[2][0]).not.toHaveProperty("inviteLinkExpiresAt");
  });

  it("never writes the use count", async () => {
    withToken();
    await call();
    expect(h.dbSet.mock.calls[0][0]).not.toHaveProperty("inviteLinkUses");
  });

  it("null max uses means unlimited", async () => {
    withToken();
    await call({ maxUses: null });
    expect(h.dbSet.mock.calls[0][0].inviteLinkMaxUses).toBeNull();
  });

  it.each([
    [2, 5],
    [365, 5],
    [7, 0],
    [7, -1],
    [7, 1.5],
    [7, 10_001],
  ])("rejects invalid values (days %p, maxUses %p)", async (days, maxUses) => {
    expect(await call({ expiresInDays: days, maxUses })).toHaveProperty(
      "error"
    );
    expect(h.dbSet).not.toHaveBeenCalled();
  });

  it("rejects when the link is disabled", async () => {
    h.selectQueue.push([{ token: null }]);
    expect(await call()).toEqual({ error: "Enable the invite link first" });
    expect(h.dbSet).not.toHaveBeenCalled();
  });
});

describe("regenerate / disable / role", () => {
  it("regenerate gives a clean slate: new token, uses 0, no expiry, no max uses; refreshes", async () => {
    expect(await regenerateInviteLink("ws-1")).toEqual({ ok: true });
    const set = h.dbSet.mock.calls[0][0];
    expect(typeof set.inviteLinkToken).toBe("string");
    expect(set).toMatchObject({
      inviteLinkExpiresAt: null,
      inviteLinkMaxUses: null,
      inviteLinkUses: 0,
    });
    expect(h.refresh).toHaveBeenCalledWith("ws-1");
  });

  it("regenerate is admin only", async () => {
    h.membership.mockResolvedValue({ role: "MEMBER" });
    expect(await regenerateInviteLink("ws-1")).toHaveProperty("error");
    expect(h.dbSet).not.toHaveBeenCalled();
  });

  it("disable only clears the token", async () => {
    await disableInviteLink("ws-1");
    expect(h.dbSet.mock.calls[0][0]).toMatchObject({ inviteLinkToken: null });
    expect(h.dbSet.mock.calls[0][0]).not.toHaveProperty("inviteLinkUses");
  });

  it("changing the role leaves expiry/max uses/uses untouched", async () => {
    await setInviteLinkRole("ws-1", "GUEST");
    expect(Object.keys(h.dbSet.mock.calls[0][0]).sort()).toEqual([
      "inviteLinkRole",
      "updatedAt",
    ]);
  });
});
