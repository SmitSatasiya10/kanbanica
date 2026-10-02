import { eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { MembersManager } from "@/components/workspace/members-manager";
import { PRODUCT_NAME } from "@/config/platform";
import { workspace, workspaceMember } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { INVITE_LINK_ROLES, type InviteLinkRole } from "@/db/schema/workspace";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getWorkspaceMemberCapacity } from "@/lib/workspace-limits";

interface MembersPageProps {
  params: Promise<{ workspaceId: string }>;
}

export const metadata = { title: `Members — ${PRODUCT_NAME}` };

export default async function MembersPage({ params }: MembersPageProps) {
  const { workspaceId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  const [ws] = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      inviteLinkToken: workspace.inviteLinkToken,
      inviteLinkRole: workspace.inviteLinkRole,
      inviteLinkExpiresAt: workspace.inviteLinkExpiresAt,
      inviteLinkMaxUses: workspace.inviteLinkMaxUses,
      inviteLinkUses: workspace.inviteLinkUses,
    })
    .from(workspace)
    .where(eq(workspace.id, workspaceId));
  if (!ws) {
    notFound();
  }

  const memberRecords = await db
    .select()
    .from(workspaceMember)
    .where(eq(workspaceMember.workspaceId, workspaceId))
    .orderBy(workspaceMember.createdAt);

  const userIds = [
    ...new Set(
      memberRecords.flatMap((m) =>
        [m.userId, m.invitedBy].filter((id): id is string => !!id)
      )
    ),
  ];

  const users = userIds.length
    ? await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        })
        .from(user)
        .where(inArray(user.id, userIds))
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const actor = memberRecords.find(
    (m) => m.userId === session.user.id && m.status === "ACTIVE"
  );
  if (!actor) {
    notFound();
  }

  const members = memberRecords
    .filter((m) => m.status === "ACTIVE" && m.userId)
    .map((m) => {
      const u = userById.get(m.userId!);
      return {
        id: m.id,
        userId: m.userId!,
        name: u?.name ?? "Deleted User",
        email: u?.email ?? "—",
        image: u?.image ?? null,
        role: m.role,
        joinedAt: (m.joinedAt ?? m.createdAt).toISOString(),
      };
    });

  const pendingInvites = memberRecords
    .filter((m) => m.status === "INVITED")
    .map((m) => ({
      id: m.id,
      email: m.email ?? "—",
      role: m.role,
      invitedByName: m.invitedBy
        ? (userById.get(m.invitedBy)?.name ?? "—")
        : "—",
      sentAt: m.createdAt.toISOString(),
      expiresAt: m.inviteExpiresAt?.toISOString() ?? null,
    }));

  const memberCapacity = await getWorkspaceMemberCapacity(workspaceId);

  return (
    <MembersManager
      actorRole={actor.role}
      appUrl={env.APP_URL}
      currentUserId={session.user.id}
      inviteLinkExpiresAt={ws.inviteLinkExpiresAt?.toISOString() ?? null}
      inviteLinkMaxUses={ws.inviteLinkMaxUses}
      inviteLinkRole={
        INVITE_LINK_ROLES.includes(ws.inviteLinkRole as InviteLinkRole)
          ? (ws.inviteLinkRole as InviteLinkRole)
          : "MEMBER"
      }
      inviteLinkToken={ws.inviteLinkToken ?? null}
      inviteLinkUses={ws.inviteLinkUses}
      memberCapacity={memberCapacity}
      members={members}
      pendingInvites={pendingInvites}
      workspaceId={workspaceId}
      workspaceName={ws.name}
    />
  );
}
