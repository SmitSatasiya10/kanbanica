import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { isValidInviteToken } from "@/lib/pending-join";

describe("isValidInviteToken", () => {
  it.each(["abc123", "a_b-C9", "zsuxtrwbdomf1g734u878a6i"])("accepts %s", (t) =>
    expect(isValidInviteToken(t)).toBe(true)
  );

  it.each([
    "",
    "https://evil.example.com",
    "//evil.example.com",
    "../admin",
    "a/b",
    "a?x=1",
    "x".repeat(129),
  ])("rejects %j", (t) => expect(isValidInviteToken(t)).toBe(false));
});
