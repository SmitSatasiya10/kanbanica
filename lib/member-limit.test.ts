import { describe, expect, it } from "vitest";
import {
  GUEST_LIMIT_CODE,
  isValidGuestLimit,
  isValidMemberLimit,
  MAX_MEMBER_LIMIT,
  MEMBER_LIMIT_CODE,
  memberBucket,
  memberLimitReachedMessage,
} from "@/lib/member-limit";

describe("memberBucket", () => {
  it.each(["OWNER", "ADMIN", "MEMBER"])("%s counts as a member", (role) => {
    expect(memberBucket(role)).toBe("members");
  });
  it("GUEST counts as a guest", () => {
    expect(memberBucket("GUEST")).toBe("guests");
  });
});

describe("isValidMemberLimit", () => {
  it("accepts 1..100,000 inclusive", () => {
    expect(isValidMemberLimit(1)).toBe(true);
    expect(isValidMemberLimit(MAX_MEMBER_LIMIT)).toBe(true);
  });
  it.each([0, -1, 1.5, MAX_MEMBER_LIMIT + 1, Number.NaN, "5", null, undefined])(
    "rejects %p",
    (v) => expect(isValidMemberLimit(v)).toBe(false)
  );
});

describe("isValidGuestLimit", () => {
  it("accepts 0 (no guests) up to 100,000", () => {
    expect(isValidGuestLimit(0)).toBe(true);
    expect(isValidGuestLimit(MAX_MEMBER_LIMIT)).toBe(true);
  });
  it.each([-1, 0.5, MAX_MEMBER_LIMIT + 1, Number.NaN, "0", null])(
    "rejects %p",
    (v) => expect(isValidGuestLimit(v)).toBe(false)
  );
});

describe("messages and codes", () => {
  it("names the bucket and formats the limit", () => {
    expect(memberLimitReachedMessage("members", 1500)).toContain(
      "member limit (1,500)"
    );
    expect(memberLimitReachedMessage("guests", 5)).toContain("guest limit (5)");
  });
  it("exposes stable codes", () => {
    expect(MEMBER_LIMIT_CODE).toBe("MEMBER_LIMIT_REACHED");
    expect(GUEST_LIMIT_CODE).toBe("GUEST_LIMIT_REACHED");
  });
});
