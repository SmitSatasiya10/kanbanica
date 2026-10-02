import { describe, expect, it, vi } from "vitest";
import {
  autoDetectMapping,
  FIXED_MAPPABLE_FIELDS,
  IMPORT_FIELD_KEYS,
} from "@/lib/import-export/column-mapping";
import { parseCsv } from "@/lib/import-export/csv";
import {
  buildCsvTemplate,
  CSV_TEMPLATE_FILENAME,
  CSV_TEMPLATE_HEADERS,
  downloadCsvTemplate,
} from "@/lib/import-export/csv-template";

describe("buildCsvTemplate", () => {
  it("has a header for every supported import field, in order", () => {
    const { headers } = parseCsv(buildCsvTemplate());
    expect(headers).toEqual(
      IMPORT_FIELD_KEYS.map((k) => CSV_TEMPLATE_HEADERS[k])
    );
    expect(Object.keys(CSV_TEMPLATE_HEADERS).sort()).toEqual(
      [...IMPORT_FIELD_KEYS].sort()
    );
    expect(FIXED_MAPPABLE_FIELDS.map((f) => f.key)).toEqual([
      ...IMPORT_FIELD_KEYS,
    ]);
  });

  it("auto-maps every header to its own field", () => {
    const { headers } = parseCsv(buildCsvTemplate());
    const mapping = autoDetectMapping(headers, []);
    for (const key of IMPORT_FIELD_KEYS) {
      expect(mapping[CSV_TEMPLATE_HEADERS[key]]).toBe(key);
    }
  });

  it("is well-formed CSV: BOM, CRLF, consistent column count", () => {
    const csv = buildCsvTemplate();
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\n");
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(Object.keys(result.rows[0])).toHaveLength(IMPORT_FIELD_KEYS.length);
  });

  it("example row uses only fake, valid values and no workspace-specific refs", () => {
    const [row] = parseCsv(buildCsvTemplate()).rows;
    expect(row.Title).toMatch(/example/i);
    expect(["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]).toContain(row.Priority);
    expect(Number.isNaN(new Date(row["Start Date"]).getTime())).toBe(false);
    expect(Number.isNaN(new Date(row["Due Date"]).getTime())).toBe(false);
    expect(row.Status).toBe("");
    expect(row.Assignees).toBe("");
    expect(row.Tags).toBe("");
    expect(row["Parent Task"]).toBe("");
  });
});

describe("downloadCsvTemplate", () => {
  it("creates a csv blob link, clicks it, and cleans up", () => {
    const link = { click: vi.fn(), remove: vi.fn(), href: "", download: "" };
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();

    downloadCsvTemplate({
      document: { createElement: () => link, body: { appendChild } } as never,
      url: { createObjectURL, revokeObjectURL },
    });

    const blob = (createObjectURL.mock.calls[0] as unknown[])[0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(link.href).toBe("blob:fake");
    expect(link.download).toBe(CSV_TEMPLATE_FILENAME);
    expect(CSV_TEMPLATE_FILENAME.endsWith(".csv")).toBe(true);
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(link.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
