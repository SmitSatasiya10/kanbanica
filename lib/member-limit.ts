// Pure (client-safe) member/guest-limit constants and helpers — no DB imports.

/** Members = OWNER + ADMIN + MEMBER. Guests = GUEST. */
export type MemberBucket = "members" | "guests";

/** An Owner always exists, so the member limit starts at 1; 0 guests = "no guests". */
export const MIN_MEMBER_LIMIT = 1;
export const MIN_GUEST_LIMIT = 0;
export const MAX_MEMBER_LIMIT = 100_000;

export const MEMBER_LIMIT_CODE = "MEMBER_LIMIT_REACHED" as const;
export const GUEST_LIMIT_CODE = "GUEST_LIMIT_REACHED" as const;

export type MemberLimitError = {
  error: string;
  code: typeof MEMBER_LIMIT_CODE | typeof GUEST_LIMIT_CODE;
};

export function memberBucket(role: string): MemberBucket {
  return role === "GUEST" ? "guests" : "members";
}

export function memberLimitReachedMessage(
  bucket: MemberBucket,
  limit: number
): string {
  const n = limit.toLocaleString("en-US");
  return bucket === "guests"
    ? `This workspace has reached its guest limit (${n}). Ask an admin to raise the limit or remove guests. Pending invitations count.`
    : `This workspace has reached its member limit (${n}). Ask an admin to raise the limit or remove members. Pending invitations count.`;
}

export function isValidMemberLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_MEMBER_LIMIT &&
    value <= MAX_MEMBER_LIMIT
  );
}

export function isValidGuestLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_GUEST_LIMIT &&
    value <= MAX_MEMBER_LIMIT
  );
}
