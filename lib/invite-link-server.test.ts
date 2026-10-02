import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { consumeInviteLinkUse } from "@/lib/invite-link-server";

function makeTx(row: Record<string, unknown> | null) {
  const calls: string[] = [];
  const setMock = vi.fn();
  const tx = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          for: (mode: string) => {
            calls.push(`select-for-${mode}`);
            return Promise.resolve(row ? [row] : []);
          },
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (v: unknown) => {
        setMock(v);
        return {
          where: () => {
            calls.push("update-uses");
            return Promise.resolve();
          },
        };
      },
    })),
  };
  return { tx: tx as never, calls, raw: tx, setMock };
}

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);
const base = { token: "tok", expiresAt: null, maxUses: null, uses: 0 };

describe("consumeInviteLinkUse", () => {
  it("locks the row, then increments uses once for a valid link", async () => {
    const { tx, calls, setMock } = makeTx({
      ...base,
      maxUses: 5,
      uses: 2,
      expiresAt: future,
    });
    expect(await consumeInviteLinkUse(tx, "ws-1", "tok")).toBeNull();
    expect(calls).toEqual(["select-for-update", "update-uses"]);
    expect(setMock).toHaveBeenCalledTimes(1);
  });

  it("legacy link (null expiry/max) is consumed normally", async () => {
    const { tx } = makeTx({ ...base, uses: 400 });
    expect(await consumeInviteLinkUse(tx, "ws-1", "tok")).toBeNull();
  });

  it("expired: rejected with the expired code, no increment", async () => {
    const { tx, raw } = makeTx({ ...base, expiresAt: past });
    expect(await consumeInviteLinkUse(tx, "ws-1", "tok")).toMatchObject({
      code: "INVITE_LINK_EXPIRED",
    });
    expect(raw.update).not.toHaveBeenCalled();
  });

  it("exhausted: rejected with the exhausted code, no increment", async () => {
    const { tx, raw } = makeTx({ ...base, maxUses: 1, uses: 1 });
    expect(await consumeInviteLinkUse(tx, "ws-1", "tok")).toMatchObject({
      code: "INVITE_LINK_EXHAUSTED",
    });
    expect(raw.update).not.toHaveBeenCalled();
  });

  it("token no longer matches (regenerated/disabled mid-join): rejected, no increment", async () => {
    const { tx, raw } = makeTx({ ...base, token: "new-token" });
    expect(await consumeInviteLinkUse(tx, "ws-1", "tok")).toEqual({
      error: "This invite link is invalid or has been disabled.",
    });
    expect(raw.update).not.toHaveBeenCalled();

    const disabled = makeTx({ ...base, token: null });
    expect(
      await consumeInviteLinkUse(disabled.tx, "ws-1", "tok")
    ).toHaveProperty("error");
  });

  it("missing workspace: rejected", async () => {
    const { tx } = makeTx(null);
    expect(await consumeInviteLinkUse(tx, "gone", "tok")).toHaveProperty(
      "error"
    );
  });
});
