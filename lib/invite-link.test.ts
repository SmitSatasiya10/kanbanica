import { describe, expect, it } from "vitest";
import {
  expiryFromDays,
  getInviteLinkState,
  INVITE_LINK_EXHAUSTED_CODE,
  INVITE_LINK_EXPIRED_CODE,
  inviteLinkErrorFor,
  isValidExpiryDays,
  isValidInviteLinkMaxUses,
  MAX_INVITE_LINK_USES,
} from "@/lib/invite-link";

const NOW = new Date("2026-10-02T12:00:00Z");
const link = (
  over: Partial<Parameters<typeof getInviteLinkState>[0]> = {}
) => ({
  token: "tok",
  expiresAt: null,
  maxUses: null,
  uses: 0,
  ...over,
});

describe("getInviteLinkState", () => {
  it("no token = disabled", () => {
    expect(getInviteLinkState(link({ token: null }), NOW)).toBe("disabled");
  });

  it("legacy link (null expiry, null max uses) is always active", () => {
    expect(getInviteLinkState(link({ uses: 99_999 }), NOW)).toBe("active");
  });

  it("expiry boundary: in the future active, exactly now or past expired", () => {
    const future = new Date(NOW.getTime() + 1);
    expect(getInviteLinkState(link({ expiresAt: future }), NOW)).toBe("active");
    expect(getInviteLinkState(link({ expiresAt: NOW }), NOW)).toBe("expired");
    expect(
      getInviteLinkState(link({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)
    ).toBe("expired");
  });

  it("max-uses boundary: uses < max active, uses >= max exhausted", () => {
    expect(getInviteLinkState(link({ maxUses: 3, uses: 2 }), NOW)).toBe(
      "active"
    );
    expect(getInviteLinkState(link({ maxUses: 3, uses: 3 }), NOW)).toBe(
      "exhausted"
    );
    expect(getInviteLinkState(link({ maxUses: 3, uses: 4 }), NOW)).toBe(
      "exhausted"
    );
  });

  it("expired wins when both expired and exhausted", () => {
    expect(
      getInviteLinkState(link({ expiresAt: NOW, maxUses: 1, uses: 1 }), NOW)
    ).toBe("expired");
  });
});

describe("validators and helpers", () => {
  it("max uses: integer 1..10,000", () => {
    expect(isValidInviteLinkMaxUses(1)).toBe(true);
    expect(isValidInviteLinkMaxUses(MAX_INVITE_LINK_USES)).toBe(true);
    for (const v of [
      0,
      -1,
      1.5,
      MAX_INVITE_LINK_USES + 1,
      Number.NaN,
      "5",
      null,
    ]) {
      expect(isValidInviteLinkMaxUses(v)).toBe(false);
    }
  });

  it("expiry days: presets only", () => {
    for (const d of [1, 7, 30, 90]) {
      expect(isValidExpiryDays(d)).toBe(true);
    }
    for (const d of [0, 2, 365, -7, "7", null]) {
      expect(isValidExpiryDays(d)).toBe(false);
    }
  });

  it("expiryFromDays adds whole days", () => {
    expect(expiryFromDays(7, NOW).toISOString()).toBe(
      "2026-10-09T12:00:00.000Z"
    );
  });

  it("errors carry stable codes and fixed copy", () => {
    expect(inviteLinkErrorFor("expired").code).toBe(INVITE_LINK_EXPIRED_CODE);
    expect(inviteLinkErrorFor("exhausted").code).toBe(
      INVITE_LINK_EXHAUSTED_CODE
    );
    expect(inviteLinkErrorFor("expired").error).toContain("expired");
    expect(inviteLinkErrorFor("exhausted").error).toContain(
      "maximum number of uses"
    );
  });
});
