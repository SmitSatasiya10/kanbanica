import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { setPendingInvite } from "@/lib/pending-join";

/**
 * A logged-out visitor who opened `/invite/[token]` lands here so the token can
 * be kept in an httpOnly cookie (not possible during a page render), then goes
 * to `/login`. `/post-auth` brings them back to the invite once signed in.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  await setPendingInvite(token);
  return NextResponse.redirect(new URL("/login", env.APP_URL));
}
