import { IGNORE_TARGET } from "@/lib/import-export/column-mapping";

// Field-centric view over the existing header -> target mapping. The stored
// shape (CSV header -> Kanbanica field key | IGNORE_TARGET) is unchanged; these
// helpers only let the UI read and write it from the field's point of view.

export function columnForField(
  mapping: Record<string, string>,
  fieldKey: string
): string | null {
  return Object.keys(mapping).find((h) => mapping[h] === fieldKey) ?? null;
}

// Maps `fieldKey` to `header` (or to nothing when null). A field holds at most
// one column, so any column previously mapped to it is released.
export function assignColumn(
  mapping: Record<string, string>,
  fieldKey: string,
  header: string | null
): Record<string, string> {
  const next = { ...mapping };
  for (const h of Object.keys(next)) {
    if (next[h] === fieldKey) {
      next[h] = IGNORE_TARGET;
    }
  }
  if (header !== null) {
    next[header] = fieldKey;
  }
  return next;
}

// A column already feeding another field can't be picked again (same rule as
// before: one target per column, one column per target).
export function isColumnTakenByOtherField(
  mapping: Record<string, string>,
  header: string,
  fieldKey: string
): boolean {
  const target = mapping[header];
  return (
    target !== undefined && target !== IGNORE_TARGET && target !== fieldKey
  );
}

export function filterColumns(headers: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  return q ? headers.filter((h) => h.toLowerCase().includes(q)) : headers;
}
