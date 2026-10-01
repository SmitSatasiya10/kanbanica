"use client";

import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type ExportScope =
  | { kind: "list"; listId: string }
  | { kind: "space"; spaceId: string };

function exportUrl(scope: ExportScope, taskIds?: string[]): string {
  const base =
    scope.kind === "list"
      ? `/api/lists/${scope.listId}/export`
      : `/api/spaces/${scope.spaceId}/export`;
  if (taskIds && taskIds.length > 0) {
    return `${base}?taskIds=${taskIds.map(encodeURIComponent).join(",")}`;
  }
  return base;
}

// Triggers a same-origin authenticated download via a temporary <a> click —
// the standard way to force a download from a GET route handler's
// Content-Disposition: attachment response without navigating the page (same
// response shape as app/api/account/export/route.ts).
function triggerDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Public helper for callers that render their own trigger element (e.g. a
// DropdownMenuItem, which is itself the clickable element — nesting a
// <button> inside one would create an invalid nested-interactive element).
export function triggerExportDownload(scope: ExportScope, taskIds?: string[]) {
  triggerDownload(exportUrl(scope, taskIds));
}

// Icon-button variant for the List/Board toolbar — matches the
// ManageFieldsIcon button's size/style exactly.
export function ExportIconButton({
  scope,
  className,
}: {
  scope: ExportScope;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "flex items-center justify-center size-8 rounded-lg border border-base-300 text-base-content/60 hover:bg-base-200/30 hover:text-base-content transition-colors cursor-pointer",
        className
      )}
      onClick={() => triggerDownload(exportUrl(scope))}
      title="Export Tasks (CSV)"
      type="button"
    >
      <DownloadSimpleIcon className="size-4" />
    </button>
  );
}

// Menu-row variant for the mobile overflow Popover ("More actions") and for
// Project Settings — a labeled row rather than a bare icon button.
export function ExportMenuRow({
  scope,
  label = "Export Tasks (CSV)",
  className,
}: {
  scope: ExportScope;
  label?: string;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-base-200",
        className
      )}
      onClick={() => triggerDownload(exportUrl(scope))}
      type="button"
    >
      <DownloadSimpleIcon className="size-4 text-base-content/60" />
      {label}
    </button>
  );
}

// Dark "selected tasks" bar variant — matches BulkActionBar's other buttons
// (list-view.tsx) exactly.
export function ExportSelectedButton({
  scope,
  taskIds,
  disabled,
}: {
  scope: ExportScope;
  taskIds: string[];
  disabled?: boolean;
}) {
  return (
    <button
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
      disabled={disabled || taskIds.length === 0}
      onClick={() => triggerDownload(exportUrl(scope, taskIds))}
      type="button"
    >
      <DownloadSimpleIcon className="size-3.5" />
      Export
    </button>
  );
}
