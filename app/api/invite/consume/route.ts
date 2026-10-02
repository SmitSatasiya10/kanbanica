import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clearPendingInvite, readPendingInvite } from "@/lib/pending-join";

/**
 * Called from `/post-auth` once the user is authenticated and has a name:
 * clears the pending-invite cookie and returns them to `/invite/<token>`.
 * Nothing is accepted here — the invite page still validates and accepts.
 */
export async function GET() {
  const token = await readPendingInvite();
  await clearPendingInvite();
  const path = token ? `/invite/${token}` : "/post-auth";
  return NextResponse.redirect(new URL(path, env.APP_URL));
}
