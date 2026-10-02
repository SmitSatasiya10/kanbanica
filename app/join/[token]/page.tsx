import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PRODUCT_NAME } from "@/config/platform";
import { workspace } from "@/db/schema";
import { getCurrentSession } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  getInviteLinkState,
  INVITE_LINK_EXHAUSTED_MESSAGE,
  INVITE_LINK_EXPIRED_MESSAGE,
} from "@/lib/invite-link";
import { JoinError, JoinWorkspaceCard } from "./join-client";

export const metadata = { title: `Join workspace — ${PRODUCT_NAME}` };

const LIMIT_MESSAGES: Record<string, string> = {
  link_expired: INVITE_LINK_EXPIRED_MESSAGE,
  link_exhausted: INVITE_LINK_EXHAUSTED_MESSAGE,
  member_limit:
    "This workspace has reached its member limit. Ask a workspace admin to raise the limit or free up a seat, then try the link again.",
  guest_limit:
    "This workspace has reached its guest limit. Ask a workspace admin to raise the limit or free up a seat, then try the link again.",
};

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const session = await getCurrentSession();
  if (!session) {
    // Cookies can't be set during a Server Component render, so hand off to a
    // route handler that stashes the token and redirects to /login. After the
    // visitor signs in (any method) `/post-auth` reads the cookie and joins
    // them — no need to click the invite link a second time.
    redirect(`/api/join/${encodeURIComponent(token)}`);
  }

  const [ws] = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      inviteLinkRole: workspace.inviteLinkRole,
      inviteLinkExpiresAt: workspace.inviteLinkExpiresAt,
      inviteLinkMaxUses: workspace.inviteLinkMaxUses,
      inviteLinkUses: workspace.inviteLinkUses,
    })
    .from(workspace)
    .where(
      and(eq(workspace.inviteLinkToken, token), eq(workspace.status, "ACTIVE"))
    );

  if (!ws) {
    return (
      <JoinError message="This invite link is invalid or has been disabled." />
    );
  }

  // Display only — joinViaLink re-checks under the workspace row lock.
  const linkState = getInviteLinkState({
    token,
    expiresAt: ws.inviteLinkExpiresAt,
    maxUses: ws.inviteLinkMaxUses,
    uses: ws.inviteLinkUses,
  });
  if (linkState === "expired") {
    return <JoinError message={INVITE_LINK_EXPIRED_MESSAGE} />;
  }
  if (linkState === "exhausted") {
    return <JoinError message={INVITE_LINK_EXHAUSTED_MESSAGE} />;
  }

  if (error && LIMIT_MESSAGES[error]) {
    return <JoinError message={LIMIT_MESSAGES[error]} />;
  }

  return (
    <JoinWorkspaceCard
      role={ws.inviteLinkRole}
      token={token}
      workspaceName={ws.name}
    />
  );
}
