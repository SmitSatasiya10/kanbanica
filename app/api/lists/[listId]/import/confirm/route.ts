import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { list, space } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bulkImportTasks } from "@/lib/import-export/bulk-import-tasks";
import { MAX_IMPORT_ROWS } from "@/lib/import-export/limits";

interface ConfirmBody {
  mapping: Record<string, string>;
  rows: { rowIndex: number; row: Record<string, string> }[];
}

// POST /api/lists/:listId/import/confirm — creates tasks for the rows the
// user kept after reviewing the /validate preview. bulkImportTasks
// re-validates everything against fresh data before writing anything, so a
// row that became invalid between the two requests (e.g. an assignee left
// the workspace) fails individually instead of silently succeeding with bad
// data or aborting the whole batch.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listId } = await params;
  const [listRow] = await db
    .select({ id: list.id, spaceId: list.spaceId })
    .from(list)
    .where(eq(list.id, listId))
    .limit(1);
  if (!listRow) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  const [spaceRow] = await db
    .select({ workspaceId: space.workspaceId })
    .from(space)
    .where(eq(space.id, listRow.spaceId))
    .limit(1);
  if (!spaceRow) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  let body: ConfirmBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  if (!body.mapping || !Array.isArray(body.rows)) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  if (body.rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      {
        error: `Import is limited to ${MAX_IMPORT_ROWS} rows per file (got ${body.rows.length})`,
      },
      { status: 413 }
    );
  }

  const result = await bulkImportTasks(
    session.user.id,
    { workspaceId: spaceRow.workspaceId, spaceId: listRow.spaceId, listId },
    body.mapping,
    body.rows
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  return NextResponse.json(result);
}
