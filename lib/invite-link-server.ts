import { eq, sql } from "drizzle-orm";
import { workspace } from "@/db/schema";
import {
  getInviteLinkState,
  type InviteLinkError,
  inviteLinkErrorFor,
} from "@/lib/invite-link";
import type { DbTransaction } from "@/lib/workspace-limits";

/**
 * Validates the shared invite link and consumes one use. Call it INSIDE the
 * join transaction, after `requireMemberCapacity` (which has already locked the
 * workspace row — a second `FOR UPDATE` on the same row in the same transaction
 * is safe) and before the member insert. Re-reads the link under the lock and
 * checks the token still matches, so a regenerate/disable racing a join is
 * refused. Writes (the use increment) only when everything passes, so a
 * failure never burns a use.
 */
export async function consumeInviteLinkUse(
  tx: DbTransaction,
  workspaceId: string,
  token: string
): Promise<InviteLinkError | { error: string; code?: undefined } | null> {
  const [ws] = await tx
    .select({
      token: workspace.inviteLinkToken,
      expiresAt: workspace.inviteLinkExpiresAt,
      maxUses: workspace.inviteLinkMaxUses,
      uses: workspace.inviteLinkUses,
    })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .for("update");

  if (!ws || ws.token !== token) {
    return { error: "This invite link is invalid or has been disabled." };
  }

  const state = getInviteLinkState(ws);
  if (state === "expired" || state === "exhausted") {
    return inviteLinkErrorFor(state);
  }

  await tx
    .update(workspace)
    .set({ inviteLinkUses: sql`${workspace.inviteLinkUses} + 1` })
    .where(eq(workspace.id, workspaceId));
  return null;
}
