import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { db } from "@/lib/db";

/** A user "has a name" only if it's non-blank — signup can leave it as "". */
export function hasDisplayName(name: string | null | undefined): boolean {
  return !!name?.trim();
}

/** Same-origin path guard for the post-profile redirect (no open redirects). */
export function safeNextPath(next: string | null | undefined): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/post-auth";
}

export function completeProfileUrl(next: string): string {
  return `/complete-profile?next=${encodeURIComponent(next)}`;
}

/**
 * Reads the name from the DB, not the session: Better Auth's cookie cache can
 * serve a stale (blank) name for up to its maxAge after the user saves one.
 */
export async function userHasDisplayName(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return hasDisplayName(row?.name);
}
