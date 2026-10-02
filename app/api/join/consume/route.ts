import { NextResponse } from "next/server";
import { joinViaLink } from "@/app/actions/workspace";
import { env } from "@/lib/env";
import {
  INVITE_LINK_EXHAUSTED_CODE,
  INVITE_LINK_EXPIRED_CODE,
} from "@/lib/invite-link";
import { GUEST_LIMIT_CODE, MEMBER_LIMIT_CODE } from "@/lib/member-limit";
import { clearPendingJoin, readPendingJoin } from "@/lib/pending-join";

/**
 * Consumes the pending shared-invite-link cookie after authentication (in a
 * route handler since cookie mutations aren't allowed during page render).
 * Redirects into the workspace on success; on failure clears the cookie and
 * bounces back to `/post-auth` (or to the join page with an explanation when
 * the link expired, ran out of uses, or the workspace hit its member/guest
 * limit).
 */
export async function GET() {
  const token = await readPendingJoin();
  await clearPendingJoin();

  if (token) {
    const res = await joinViaLink(token);
    if (!("error" in res)) {
      return NextResponse.redirect(new URL(`/${res.workspaceId}`, env.APP_URL));
    }
    // Workspace is full: send them back to the join page, which explains why
    // (a fixed message keyed off a short code, never raw error text in the URL).
    if ("code" in res && res.code === MEMBER_LIMIT_CODE) {
      return NextResponse.redirect(
        new URL(
          `/join/${encodeURIComponent(token)}?error=member_limit`,
          env.APP_URL
        )
      );
    }
    if ("code" in res && res.code === INVITE_LINK_EXPIRED_CODE) {
      return NextResponse.redirect(
        new URL(
          `/join/${encodeURIComponent(token)}?error=link_expired`,
          env.APP_URL
        )
      );
    }
    if ("code" in res && res.code === INVITE_LINK_EXHAUSTED_CODE) {
      return NextResponse.redirect(
        new URL(
          `/join/${encodeURIComponent(token)}?error=link_exhausted`,
          env.APP_URL
        )
      );
    }
    if ("code" in res && res.code === GUEST_LIMIT_CODE) {
      return NextResponse.redirect(
        new URL(
          `/join/${encodeURIComponent(token)}?error=guest_limit`,
          env.APP_URL
        )
      );
    }
  }

  return NextResponse.redirect(new URL("/post-auth", env.APP_URL));
}
