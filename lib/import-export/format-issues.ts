// Presentation-only: turns the plain message strings produced by
// `validateImportRow` into labelled items for the preview UI. It never feeds
// back into validation — unrecognised messages fall through unchanged under a
// generic "Other" label, so nothing is ever hidden.

export type IssueSeverity = "error" | "warning" | "info";

export interface FormattedIssue {
  // Secondary line, e.g. the list of valid values.
  hint?: string;
  label: string;
  message: string;
  severity: IssueSeverity;
}

type Matcher = (text: string) => Omit<FormattedIssue, "severity"> | null;

const MATCHERS: Matcher[] = [
  (t) => {
    const m = t.match(
      /^Status "([\s\S]*)" was not found\. Valid statuses: ([\s\S]*)$/
    );
    return m
      ? {
          label: "Status",
          message: `"${m[1]}" is not a valid status`,
          hint: `Valid values: ${m[2]}`,
        }
      : null;
  },
  (t) => {
    const m = t.match(
      /^Priority "([\s\S]*)" is invalid\. Valid values: ([\s\S]*)$/
    );
    return m
      ? {
          label: "Priority",
          message: `"${m[1]}" is not a valid priority`,
          hint: `Valid values: ${m[2]
            .split(", ")
            .map((v) => v.charAt(0) + v.slice(1).toLowerCase())
            .join(", ")}`,
        }
      : null;
  },
  (t) => {
    const m = t.match(
      /^(Start date|Due date) "([\s\S]*)" is not a valid date$/
    );
    return m
      ? {
          label: m[1] === "Start date" ? "Start Date" : "Due Date",
          message: `Invalid date: "${m[2]}"`,
        }
      : null;
  },
  (t) => {
    const m = t.match(/^Assignee "([\s\S]*)" was not found$/);
    return m
      ? { label: "Assignee", message: `Assignee "${m[1]}" was not found` }
      : null;
  },
  (t) =>
    t.startsWith("Parent task ") || t.startsWith("Cannot nest subtasks")
      ? { label: "Parent Task", message: t }
      : null,
  (t) => {
    const m = t.match(/^New tags? will be created: ([\s\S]*)$/);
    return m
      ? { label: "Tags", message: `New tags will be created: ${m[1]}` }
      : null;
  },
  (t) =>
    t.startsWith("Status not specified")
      ? { label: "Status", message: t }
      : null,
  (t) =>
    t === "Due date is before the start date"
      ? { label: "Due Date", message: t }
      : null,
  (t) => (t === "Title is required" ? { label: "Title", message: t } : null),
  // Custom fields: "<Field name>: ..." / "<Field name> is required..."
  (t) => {
    const m = t.match(/^([\s\S]+?): ([\s\S]*)$/);
    return m ? { label: m[1], message: m[2] } : null;
  },
  (t) => {
    const m = t.match(
      /^([\s\S]+?) is required( but is not mapped to a column)?$/
    );
    return m ? { label: m[1], message: t } : null;
  },
];

export function formatIssue(
  text: string,
  kind: "error" | "warning"
): FormattedIssue {
  for (const match of MATCHERS) {
    const found = match(text);
    if (found) {
      const isTagNote = found.label === "Tags" && kind === "warning";
      return {
        ...found,
        severity: kind === "error" ? "error" : isTagNote ? "info" : "warning",
      };
    }
  }
  return { label: "Other", message: text, severity: kind };
}

export function formatRowIssues(
  errors: string[],
  warnings: string[]
): FormattedIssue[] {
  return [
    ...errors.map((e) => formatIssue(e, "error")),
    ...warnings.map((w) => formatIssue(w, "warning")),
  ];
}
