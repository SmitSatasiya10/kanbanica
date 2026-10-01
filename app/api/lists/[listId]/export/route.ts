import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { list, space } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/import-export/csv";
import { getExportableTasks } from "@/lib/import-export/export-tasks";

// GET /api/lists/:listId/export — CSV export of this list's tasks, or only
// `?taskIds=a,b,c` when exporting a selection. Route handler (not a server
// action) so the response can carry a file download — same pattern as
// app/api/account/export/route.ts.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listId } = await params;
  const [listRow] = await db
    .select({ id: list.id, name: list.name, spaceId: list.spaceId })
    .from(list)
    .where(eq(list.id, listId))
    .limit(1);
  if (!listRow) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  const [spaceRow] = await db
    .select({ workspaceId: space.workspaceId, name: space.name })
    .from(space)
    .where(eq(space.id, listRow.spaceId))
    .limit(1);
  if (!spaceRow) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const taskIdsParam = request.nextUrl.searchParams.get("taskIds");
  const taskIds = taskIdsParam
    ? taskIdsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const result = await getExportableTasks(session.user.id, {
    workspaceId: spaceRow.workspaceId,
    spaceId: listRow.spaceId,
    listId,
    taskIds,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const csv = toCsv(result.rows, result.columns);
  const filename = `${listRow.name.replace(/[^a-z0-9]+/gi, "_")}-tasks-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
