import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { space } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/import-export/csv";
import { getExportableTasks } from "@/lib/import-export/export-tasks";

// GET /api/spaces/:spaceId/export — CSV export of every non-archived task
// across the whole project (all lists), for the "current project" export
// scope. List-scoped custom fields are omitted here (see getExportableTasks)
// since tasks span multiple lists.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { spaceId } = await params;
  const [spaceRow] = await db
    .select({ workspaceId: space.workspaceId, name: space.name })
    .from(space)
    .where(eq(space.id, spaceId))
    .limit(1);
  if (!spaceRow) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const result = await getExportableTasks(session.user.id, {
    workspaceId: spaceRow.workspaceId,
    spaceId,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const csv = toCsv(result.rows, result.columns);
  const filename = `${spaceRow.name.replace(/[^a-z0-9]+/gi, "_")}-tasks-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
