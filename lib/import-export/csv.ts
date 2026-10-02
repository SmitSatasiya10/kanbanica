import Papa from "papaparse";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

// Isomorphic (browser + Node) RFC4180 parser — used both client-side (upload
// preview) and server-side (route handlers re-parse nothing; they receive
// already-parsed rows, but share this module for the stringify/parse pair).
// `header: true` keys each row by its column header; `skipEmptyLines` drops
// genuinely blank lines (not rows with some empty cells).
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = result.meta.fields ?? [];
  const rows = result.data.map((row) => {
    const normalized: Record<string, string> = {};
    for (const header of headers) {
      normalized[header] = (row[header] ?? "").toString().trim();
    }
    return normalized;
  });
  return { headers, rows };
}

// Generates an RFC4180 CSV string (CRLF line endings, quoting only where
// needed) — correct escaping for commas/quotes/newlines so the file opens
// cleanly in Excel/Google Sheets. `columns` fixes the column order; missing
// keys in a row become empty cells.
export function toCsv(
  rows: Record<string, string>[],
  columns: string[]
): string {
  return Papa.unparse(
    {
      fields: columns,
      data: rows.map((row) => columns.map((c) => row[c] ?? "")),
    },
    { header: true }
  );
}
