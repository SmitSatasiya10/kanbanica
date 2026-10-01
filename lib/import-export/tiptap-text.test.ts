import { describe, expect, it } from "vitest";
import {
  plainTextToTiptapDoc,
  tiptapToPlainText,
} from "@/lib/import-export/tiptap-text";

describe("tiptapToPlainText", () => {
  it("joins paragraph text with newlines", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Line one" }] },
        { type: "paragraph", content: [{ type: "text", text: "Line two" }] },
      ],
    };
    expect(tiptapToPlainText(doc)).toBe("Line one\nLine two");
  });

  it("returns an empty string for null/undefined/non-object input", () => {
    expect(tiptapToPlainText(null)).toBe("");
    expect(tiptapToPlainText(undefined)).toBe("");
    expect(tiptapToPlainText("not an object")).toBe("");
  });

  it("returns an empty string for an empty doc", () => {
    expect(tiptapToPlainText({ type: "doc", content: [] })).toBe("");
  });
});

describe("plainTextToTiptapDoc", () => {
  it("creates one paragraph per line", () => {
    const doc = plainTextToTiptapDoc("Line one\nLine two");
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Line one" }],
    });
  });

  it("represents a blank line as an empty paragraph", () => {
    const doc = plainTextToTiptapDoc("Line one\n\nLine two");
    expect(doc.content?.[1]).toEqual({ type: "paragraph", content: [] });
  });

  it("round-trips through tiptapToPlainText", () => {
    const text = "First line\nSecond line";
    expect(tiptapToPlainText(plainTextToTiptapDoc(text))).toBe(text);
  });
});
