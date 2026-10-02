// No Tiptap JSON <-> plain text helper exists elsewhere in the codebase
// (confirmed: lib/notes.ts only extracts ids/booleans from the doc, never
// text) — these two small, single-purpose functions exist solely for CSV
// export/import of task.description.

interface TiptapNode {
  content?: TiptapNode[];
  text?: string;
  type?: string;
}

function collectText(node: TiptapNode, out: string[]): void {
  if (typeof node.text === "string") {
    out.push(node.text);
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      collectText(child, out);
    }
    if (node.type === "paragraph" || node.type === "heading") {
      out.push("\n");
    }
  }
}

// Walks a Tiptap JSON doc (paragraph/heading/text nodes) and joins the text
// content with newlines, one per block-level node. Returns "" for an empty or
// unparseable doc — never throws, so a corrupt description can't fail an export.
export function tiptapToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") {
    return "";
  }
  const out: string[] = [];
  collectText(doc as TiptapNode, out);
  return out.join("").trim();
}

// Builds the minimal Tiptap doc a plain-text CSV cell needs: one paragraph
// node per line (blank lines become empty paragraphs, matching how the editor
// itself represents them).
export function plainTextToTiptapDoc(text: string): TiptapNode {
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}
