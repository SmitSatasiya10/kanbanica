"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, ilike } from "drizzle-orm";
import { headers } from "next/headers";
import { tag, taskTag } from "@/db/schema";
import { writeActivityLog } from "@/lib/activity-log";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getSpacePermission,
  getWorkspaceMembership,
  hasPermissionLevel,
} from "@/lib/permissions";
import { refreshWorkspace } from "@/lib/realtime/refresh";

const TAG_COLORS = [
  "#6B7280",
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#F43F5E",
];

function randomTagColor() {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

// `taskId` lets an open task detail view skip refetching for other tasks.
function revalidateList(
  workspaceId: string,
  spaceId: string,
  listId: string,
  taskId?: string
) {
  void refreshWorkspace(
    workspaceId,
    [`/${workspaceId}/${spaceId}/list/${listId}`],
    { taskId }
  );
}

export async function getWorkspaceTags(workspaceId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { error: "Unauthorized" };
  }

  const tags = await db
    .select({ id: tag.id, name: tag.name, color: tag.color })
    .from(tag)
    .where(eq(tag.workspaceId, workspaceId))
    .orderBy(asc(tag.name));

  return { tags };
}

export async function createTag(
  workspaceId: string,
  name: string,
  color?: string
): Promise<
  { tag: { id: string; name: string; color: string } } | { error: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { error: "Unauthorized" };
  }

  const membership = await getWorkspaceMembership(session.user.id, workspaceId);
  if (!membership) {
    return { error: "Unauthorized" };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Tag name is required" };
  }

  // Check duplicate
  const [existing] = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.workspaceId, workspaceId), ilike(tag.name, trimmed)))
    .limit(1);
  if (existing) {
    return { error: "A tag with this name already exists" };
  }

  const tagColor = color ?? randomTagColor();
  const tagId = createId();

  await db.insert(tag).values({
    id: tagId,
    workspaceId,
    name: trimmed,
    color: tagColor,
  });

  return { tag: { id: tagId, name: trimmed, color: tagColor } };
}

export async function addTaskTag(
  workspaceId: string,
  spaceId: string,
  listId: string,
  taskId: string,
  tagId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { error: "Unauthorized" };
  }

  const permission = await getSpacePermission(
    session.user.id,
    workspaceId,
    spaceId
  );
  if (permission === null || !hasPermissionLevel(permission, "edit")) {
    return { error: "Forbidden" };
  }

  await db.insert(taskTag).values({ taskId, tagId }).onConflictDoNothing();

  const [t] = await db
    .select({ name: tag.name })
    .from(tag)
    .where(eq(tag.id, tagId))
    .limit(1);
  await writeActivityLog(taskId, session.user.id, "tag_added", {
    tagName: t?.name,
  });

  revalidateList(workspaceId, spaceId, listId, taskId);
  return { ok: true };
}

export async function deleteTag(
  workspaceId: string,
  tagId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { error: "Unauthorized" };
  }

  const membership = await getWorkspaceMembership(session.user.id, workspaceId);
  if (!membership) {
    return { error: "Unauthorized" };
  }

  await db
    .delete(tag)
    .where(and(eq(tag.id, tagId), eq(tag.workspaceId, workspaceId)));

  return { ok: true };
}

// Resolves a batch of tag names to ids in one pass — case-insensitive match
// against existing workspace tags, creating any that don't exist yet. Used by
// the CSV importer (lib/import-export/bulk-import-tasks.ts) to resolve every
// unique tag name across an entire import in one go, rather than looping
// createTag/getWorkspaceTags per row. Mirrors createTag's own dedup/creation
// rules so a workspace member can always freely add tags this way.
export async function findOrCreateTagsByNames(
  workspaceId: string,
  names: string[]
): Promise<Map<string, string>> {
  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const result = new Map<string, string>();
  if (uniqueNames.length === 0) {
    return result;
  }

  const existing = await db
    .select({ id: tag.id, name: tag.name })
    .from(tag)
    .where(eq(tag.workspaceId, workspaceId));
  const existingByLower = new Map(
    existing.map((t) => [t.name.toLowerCase(), t.id])
  );

  const toCreate: { id: string; name: string }[] = [];
  for (const name of uniqueNames) {
    const found = existingByLower.get(name.toLowerCase());
    if (found) {
      result.set(name.toLowerCase(), found);
    } else if (
      !toCreate.some((c) => c.name.toLowerCase() === name.toLowerCase())
    ) {
      toCreate.push({ id: createId(), name });
    }
  }

  if (toCreate.length > 0) {
    await db.insert(tag).values(
      toCreate.map((t) => ({
        id: t.id,
        workspaceId,
        name: t.name,
        color: randomTagColor(),
      }))
    );
    for (const t of toCreate) {
      result.set(t.name.toLowerCase(), t.id);
    }
  }

  return result;
}

export async function removeTaskTag(
  workspaceId: string,
  spaceId: string,
  listId: string,
  taskId: string,
  tagId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { error: "Unauthorized" };
  }

  const permission = await getSpacePermission(
    session.user.id,
    workspaceId,
    spaceId
  );
  if (permission === null || !hasPermissionLevel(permission, "edit")) {
    return { error: "Forbidden" };
  }

  await db
    .delete(taskTag)
    .where(and(eq(taskTag.taskId, taskId), eq(taskTag.tagId, tagId)));

  const [t] = await db
    .select({ name: tag.name })
    .from(tag)
    .where(eq(tag.id, tagId))
    .limit(1);
  await writeActivityLog(taskId, session.user.id, "tag_removed", {
    tagName: t?.name,
  });

  revalidateList(workspaceId, spaceId, listId, taskId);
  return { ok: true };
}
