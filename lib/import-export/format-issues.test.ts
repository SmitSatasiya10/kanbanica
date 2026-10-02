import { describe, expect, it } from "vitest";
import {
  formatIssue,
  formatRowIssues,
} from "@/lib/import-export/format-issues";

describe("formatIssue", () => {
  it("splits status errors into message + valid values", () => {
    expect(
      formatIssue(
        'Status "to do" was not found. Valid statuses: Todo, Done',
        "error"
      )
    ).toEqual({
      label: "Status",
      message: '"to do" is not a valid status',
      hint: "Valid values: Todo, Done",
      severity: "error",
    });
  });

  it("title-cases priority values", () => {
    const i = formatIssue(
      'Priority "null" is invalid. Valid values: NONE, LOW, URGENT',
      "error"
    );
    expect(i.hint).toBe("Valid values: None, Low, Urgent");
    expect(i.label).toBe("Priority");
  });

  it("formats dates, assignee and parent task", () => {
    expect(
      formatIssue('Due date "17804" is not a valid date', "error")
    ).toMatchObject({
      label: "Due Date",
      message: 'Invalid date: "17804"',
    });
    expect(formatIssue('Assignee "x" was not found', "error").label).toBe(
      "Assignee"
    );
    expect(formatIssue('Parent task "9" was not found', "error").label).toBe(
      "Parent Task"
    );
  });

  it("treats the new-tag note as info, other warnings as warnings", () => {
    expect(
      formatIssue("New tag will be created: bug", "warning").severity
    ).toBe("info");
    expect(
      formatIssue("Due date is before the start date", "warning").severity
    ).toBe("warning");
  });

  it("labels custom field messages and falls back for unknown text", () => {
    expect(
      formatIssue('Sprint: "x" is not a valid option', "error")
    ).toMatchObject({
      label: "Sprint",
      message: '"x" is not a valid option',
    });
    expect(formatIssue("weird", "error")).toEqual({
      label: "Other",
      message: "weird",
      severity: "error",
    });
  });
});

describe("formatRowIssues", () => {
  it("keeps errors before warnings and loses nothing", () => {
    const out = formatRowIssues(
      ["Title is required", 'Assignee "a" was not found'],
      ["New tag will be created: t"]
    );
    expect(out.map((i) => i.severity)).toEqual(["error", "error", "info"]);
  });
});
