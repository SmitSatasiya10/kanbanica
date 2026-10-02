// Pure (client-safe) invite-link control constants and helpers — no DB imports.

export const INVITE_LINK_EXPIRY_PRESETS = [1, 7, 30, 90] as const;
export const INVITE_LINK_MAX_USES_PRESETS = [1, 5, 10, 25, 50, 100] as const;
export const MAX_INVITE_LINK_USES = 10_000;

export const INVITE_LINK_EXPIRED_CODE = "INVITE_LINK_EXPIRED" as const;
export const INVITE_LINK_EXHAUSTED_CODE = "INVITE_LINK_EXHAUSTED" as const;

export type InviteLinkError = {
  code: typeof INVITE_LINK_EXPIRED_CODE | typeof INVITE_LINK_EXHAUSTED_CODE;
  error: string;
};

export const INVITE_LINK_EXPIRED_MESSAGE =
  "This invite link has expired. Ask a workspace admin for a new one.";
export const INVITE_LINK_EXHAUSTED_MESSAGE =
  "This invite link has reached its maximum number of uses. Ask a workspace admin for a new one.";

export type InviteLinkState = "disabled" | "active" | "expired" | "exhausted";

export interface InviteLinkFields {
  expiresAt: Date | null;
  maxUses: number | null;
  token: string | null;
  uses: number;
}

/**
 * Single source of truth for whether a link can be used right now — shared by
 * the server gate, the join page and the invite-link card. Expired wins when
 * a link is both expired and used up.
 */
export function getInviteLinkState(
  link: InviteLinkFields,
  now: Date = new Date()
): InviteLinkState {
  if (!link.token) {
    return "disabled";
  }
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  if (link.maxUses !== null && link.uses >= link.maxUses) {
    return "exhausted";
  }
  return "active";
}

export function inviteLinkErrorFor(
  state: "expired" | "exhausted"
): InviteLinkError {
  return state === "expired"
    ? { error: INVITE_LINK_EXPIRED_MESSAGE, code: INVITE_LINK_EXPIRED_CODE }
    : {
        error: INVITE_LINK_EXHAUSTED_MESSAGE,
        code: INVITE_LINK_EXHAUSTED_CODE,
      };
}

export function isValidInviteLinkMaxUses(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_INVITE_LINK_USES
  );
}

export function isValidExpiryDays(
  value: unknown
): value is (typeof INVITE_LINK_EXPIRY_PRESETS)[number] {
  return (
    typeof value === "number" &&
    (INVITE_LINK_EXPIRY_PRESETS as readonly number[]).includes(value)
  );
}

export function expiryFromDays(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
