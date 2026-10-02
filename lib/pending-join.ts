import { cookies } from "next/headers";

/**
 * A logged-out visitor who opens a shared invite link (`/join/[token]`) has the
 * token stashed in this httpOnly cookie, then is sent to `/login`. After they
 * authenticate — via any method — `/post-auth` reads the cookie and completes
 * the join. `sameSite: "lax"` is required so the cookie survives the Google
 * OAuth redirect round-trip.
 */
const COOKIE_NAME = "pending_join_token";
const MAX_AGE_SECONDS = 60 * 60; // 1 hour — plenty to complete sign-in

export async function setPendingJoin(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readPendingJoin(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function clearPendingJoin(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Same idea for per-person invitations (`/invite/[token]`): a logged-out
 * visitor's token is kept in an httpOnly cookie across login (any method,
 * incl. Google OAuth), then `/post-auth` sends them back to the invite page —
 * after the first-time name step. Only a bare token is stored; the destination
 * path is always rebuilt as `/invite/<token>`, so it can't be an open redirect.
 */
const INVITE_COOKIE_NAME = "pending_invite_token";
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidInviteToken(token: string): boolean {
  return INVITE_TOKEN_PATTERN.test(token);
}

export async function setPendingInvite(token: string): Promise<void> {
  if (!isValidInviteToken(token)) {
    return;
  }
  const store = await cookies();
  store.set(INVITE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readPendingInvite(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(INVITE_COOKIE_NAME)?.value ?? null;
  return token && isValidInviteToken(token) ? token : null;
}

export async function clearPendingInvite(): Promise<void> {
  const store = await cookies();
  store.delete(INVITE_COOKIE_NAME);
}
