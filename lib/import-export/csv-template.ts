import type { ImportFieldKey } from "@/lib/import-export/column-mapping";
import { toCsv } from "@/lib/import-export/csv";

export const CSV_TEMPLATE_FILENAME = "kanbanica-task-import-template.csv";

// One header per fixed import field, in `IMPORT_FIELD_KEYS` order. Each header
// is one of the aliases `autoDetectMapping` recognises, so an unmodified
// template maps automatically in the Map step. Custom fields are list-specific
// and so are deliberately not part of the generic template — add a column
// named after the field and it auto-maps too.
export const CSV_TEMPLATE_HEADERS: Record<ImportFieldKey, string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  priority: "Priority",
  assignees: "Assignees",
  dueDateStart: "Start Date",
  dueDateEnd: "Due Date",
  tags: "Tags",
  parentTask: "Parent Task",
};

// Status, assignees, tags and parent task are workspace/list-specific (an
// unknown status or parent is a validation error), so the example leaves them
// blank rather than guessing values.
const EXAMPLE_ROW: Partial<Record<ImportFieldKey, string>> = {
  title: "Example task - delete this row before importing",
  description: "Optional details about the task",
  priority: "MEDIUM",
  dueDateStart: "2030-01-01",
  dueDateEnd: "2030-01-31",
};

export function buildCsvTemplate(): string {
  const columns = Object.values(CSV_TEMPLATE_HEADERS);
  const example: Record<string, string> = {};
  for (const [key, value] of Object.entries(EXAMPLE_ROW)) {
    example[CSV_TEMPLATE_HEADERS[key as ImportFieldKey]] = value;
  }
  // Leading BOM so Excel opens it as UTF-8; parseCsv/Papa strips it on upload.
  return `﻿${toCsv([example], columns)}\r\n`;
}

interface DownloadEnv {
  document: Pick<Document, "createElement" | "body">;
  url: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
}

export function downloadCsvTemplate(env: DownloadEnv = { document, url: URL }) {
  const blob = new Blob([buildCsvTemplate()], {
    type: "text/csv;charset=utf-8",
  });
  const href = env.url.createObjectURL(blob);
  const link = env.document.createElement("a");
  link.href = href;
  link.download = CSV_TEMPLATE_FILENAME;
  env.document.body.appendChild(link);
  link.click();
  link.remove();
  env.url.revokeObjectURL(href);
}
