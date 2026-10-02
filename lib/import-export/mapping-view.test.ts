import { describe, expect, it } from "vitest";
import {
  autoDetectMapping,
  IGNORE_TARGET,
} from "@/lib/import-export/column-mapping";
import {
  assignColumn,
  columnForField,
  filterColumns,
  isColumnTakenByOtherField,
} from "@/lib/import-export/mapping-view";

const headers = [
  "Task Name",
  "Task Content",
  "Owner",
  "Due Date",
  "Labels",
  "Extra",
];

describe("mapping view helpers", () => {
  it("reads auto-detected mapping from the field side", () => {
    const m = autoDetectMapping(headers, []);
    expect(columnForField(m, "title")).toBe("Task Name");
    expect(columnForField(m, "assignees")).toBe("Owner");
    expect(columnForField(m, "dueDateEnd")).toBe("Due Date");
    expect(columnForField(m, "tags")).toBe("Labels");
    expect(columnForField(m, "priority")).toBeNull();
  });

  it("assigning a column maps it and releases the previous one", () => {
    const m = autoDetectMapping(headers, []);
    const next = assignColumn(m, "title", "Extra");
    expect(next.Extra).toBe("title");
    expect(next["Task Name"]).toBe(IGNORE_TARGET);
    expect(m["Task Name"]).toBe("title"); // input not mutated
  });

  it("'Do not import' (null) leaves the field unmapped", () => {
    const m = autoDetectMapping(headers, []);
    const next = assignColumn(m, "tags", null);
    expect(columnForField(next, "tags")).toBeNull();
    expect(next.Labels).toBe(IGNORE_TARGET);
  });

  it("produces the same mapping object shape the import consumes", () => {
    const m = autoDetectMapping(headers, []);
    const roundTrip = assignColumn(m, "title", columnForField(m, "title"));
    expect(roundTrip).toEqual(m);
    expect(Object.keys(roundTrip).sort()).toEqual([...headers].sort());
  });

  it("blocks columns used by another field only", () => {
    const m = autoDetectMapping(headers, []);
    expect(isColumnTakenByOtherField(m, "Owner", "title")).toBe(true);
    expect(isColumnTakenByOtherField(m, "Owner", "assignees")).toBe(false);
    expect(isColumnTakenByOtherField(m, "Extra", "title")).toBe(false);
  });

  it("filters case-insensitively and handles many columns / no match", () => {
    expect(filterColumns(headers, "TASK")).toEqual([
      "Task Name",
      "Task Content",
    ]);
    expect(filterColumns(headers, "  ")).toEqual(headers);
    expect(filterColumns(headers, "zzz")).toEqual([]);
    const many = Array.from({ length: 300 }, (_, i) => `Col ${i}`);
    expect(filterColumns(many, "col 29")).toEqual([
      "Col 29",
      "Col 290",
      "Col 291",
      "Col 292",
      "Col 293",
      "Col 294",
      "Col 295",
      "Col 296",
      "Col 297",
      "Col 298",
      "Col 299",
    ]);
  });
});
