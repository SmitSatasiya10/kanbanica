import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/import-export/csv";

describe("parseCsv", () => {
  it("parses headers and rows", () => {
    const { headers, rows } = parseCsv(
      "Title,Status\nFix bug,Open\nWrite docs,Done"
    );
    expect(headers).toEqual(["Title", "Status"]);
    expect(rows).toEqual([
      { Title: "Fix bug", Status: "Open" },
      { Title: "Write docs", Status: "Done" },
    ]);
  });

  it("handles quoted values containing commas", () => {
    const { rows } = parseCsv(
      'Title,Description\n"Fix bug, urgently","High priority"'
    );
    expect(rows[0].Title).toBe("Fix bug, urgently");
    expect(rows[0].Description).toBe("High priority");
  });

  it("handles newlines embedded inside quoted values", () => {
    const { rows } = parseCsv(
      'Title,Description\n"Fix bug","Line one\nLine two"'
    );
    expect(rows[0].Description).toBe("Line one\nLine two");
  });

  it("trims header whitespace", () => {
    const { headers } = parseCsv(" Title , Status \nA,B");
    expect(headers).toEqual(["Title", "Status"]);
  });

  it("treats a missing cell as an empty string", () => {
    const { rows } = parseCsv("Title,Status,Tags\nFix bug,Open");
    expect(rows[0].Tags).toBe("");
  });

  it("skips fully blank lines", () => {
    const { rows } = parseCsv("Title,Status\nFix bug,Open\n\nWrite docs,Done");
    expect(rows).toHaveLength(2);
  });

  it("supports UTF-8 content", () => {
    const { rows } = parseCsv("Title,Assignee\nFähigkeit prüfen,José Núñez");
    expect(rows[0].Title).toBe("Fähigkeit prüfen");
    expect(rows[0].Assignee).toBe("José Núñez");
  });
});

describe("toCsv", () => {
  it("quotes values containing commas, quotes, or newlines", () => {
    const csv = toCsv(
      [{ Title: 'Say "hi", please', Description: "Line one\nLine two" }],
      ["Title", "Description"]
    );
    expect(csv).toContain('"Say ""hi"", please"');
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("fills missing keys with empty cells and preserves column order", () => {
    const csv = toCsv([{ Title: "Fix bug" }], ["Title", "Status", "Tags"]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Title,Status,Tags");
    expect(lines[1]).toBe("Fix bug,,");
  });

  it("round-trips through parseCsv", () => {
    const original = [{ Title: "A, B", Status: 'Open "now"', Tags: "x; y" }];
    const csv = toCsv(original, ["Title", "Status", "Tags"]);
    const { rows } = parseCsv(csv);
    expect(rows).toEqual(original);
  });
});
