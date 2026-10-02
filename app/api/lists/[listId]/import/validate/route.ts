import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { list, space } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildFileRowTitleIndex,
  buildValidationContext,
} from "@/lib/import-export/bulk-import-tasks";
import { MAX_IMPORT_ROWS } from "@/lib/import-export/limits";
import {
  detectDuplicateRowIndexes,
  findUnmappedRequiredFields,
  findUnmappedRequiredFixedFields,
  type MappedTaskData,
  validateImportRow,
} from "@/lib/import-export/validate-row";
import { requireEditAccess } from "@/lib/permissions";
import { getWorkspaceCapacity } from "@/lib/workspace-limits";

interface ValidateBody {
  mapping: Record<string, string>;
  rows: { rowIndex: number; row: Record<string, string> }[];
}

// POST /api/lists/:listId/import/validate — dry-run validation of mapped CSV
// rows against the target list's statuses/members/tags/custom fields. Makes
// no writes; the client calls /confirm separately once the user approves the
// preview. Route handler (not a server action) to stay consistent with the
// rest of import/export and avoid the smaller server-action body limit.
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

  const permErr = await requireEditAccess(
    session.user.id,
    spaceRow.workspaceId,
    listRow.spaceId
  );
  if (permErr) {
    return NextResponse.json(permErr, { status: 403 });
  }

  let body: ValidateBody;
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
    return NextResponse.json(
      { error: "The file has no data rows" },
      { status: 400 }
    );
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      {
        error: `Import is limited to ${MAX_IMPORT_ROWS} rows per file (got ${body.rows.length})`,
      },
      { status: 413 }
    );
  }

  const context = await buildValidationContext(
    spaceRow.workspaceId,
    listRow.spaceId,
    listId
  );
  context.fileRowTitleToIndex = buildFileRowTitleIndex(body.mapping, body.rows);

  const missingRequired = [
    ...findUnmappedRequiredFixedFields(body.mapping),
    ...findUnmappedRequiredFields(body.mapping, context.customFields),
  ];

  const results = await Promise.all(
    body.rows.map((r) =>
      validateImportRow(r.row, body.mapping, context, r.rowIndex)
    )
  );

  // Flag likely-duplicate rows (same title/status/assignees/due date) as a
  // warning, not a hard error — the user decides whether to keep them.
  const duplicateIndexes = detectDuplicateRowIndexes(
    results
      .filter((r): r is typeof r & { data: MappedTaskData } => r.data !== null)
      .map((r) => ({ rowIndex: r.rowIndex, data: r.data }))
  );
  for (const r of results) {
    if (duplicateIndexes.has(r.rowIndex) && r.status !== "invalid") {
      r.warnings.push("Possible duplicate of another row in this file");
      r.status = "warning";
    }
  }

  const counted = results.filter((r) => r.status !== "skipped");
  const summary = {
    total: counted.length,
    valid: counted.filter((r) => r.status === "valid").length,
    warning: counted.filter((r) => r.status === "warning").length,
    invalid: counted.filter((r) => r.status === "invalid").length,
  };

  // Informational only — the authoritative check is in bulkImportTasks (confirm).
  const capacity = await getWorkspaceCapacity(spaceRow.workspaceId);

  return NextResponse.json({
    summary,
    capacity,
    missingRequired,
    rows: results.map((r) => ({
      rowIndex: r.rowIndex,
      status: r.status,
      title: r.data?.title ?? "",
      errors: r.errors,
      warnings: r.warnings,
    })),
  });
}
