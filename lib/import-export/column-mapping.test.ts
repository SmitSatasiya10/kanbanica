import { describe, expect, it } from "vitest";
import {
  autoDetectMapping,
  buildMappableFields,
  customFieldTargetKey,
  IGNORE_TARGET,
} from "@/lib/import-export/column-mapping";

describe("autoDetectMapping", () => {
  it("matches common header variants to fixed fields", () => {
    const mapping = autoDetectMapping(
      [
        "Task Name",
        "Description",
        "Status",
        "Priority",
        "Assignee",
        "Due Date",
        "Tags",
      ],
      []
    );
    expect(mapping["Task Name"]).toBe("title");
    expect(mapping.Description).toBe("description");
    expect(mapping.Status).toBe("status");
    expect(mapping.Priority).toBe("priority");
    expect(mapping.Assignee).toBe("assignees");
    expect(mapping["Due Date"]).toBe("dueDateEnd");
    expect(mapping.Tags).toBe("tags");
  });

  it("is case-insensitive and tolerant of separators", () => {
    const mapping = autoDetectMapping(["TASK_NAME", "due-date"], []);
    expect(mapping.TASK_NAME).toBe("title");
    expect(mapping["due-date"]).toBe("dueDateEnd");
  });

  it("maps a header matching a custom field's name by exact name match", () => {
    const mapping = autoDetectMapping(
      ["Title", "Customer Type"],
      [{ id: "field-1", name: "Customer Type" }]
    );
    expect(mapping["Customer Type"]).toBe(customFieldTargetKey("field-1"));
  });

  it("falls back to IGNORE_TARGET for unrecognized headers", () => {
    const mapping = autoDetectMapping(["Some Random Column"], []);
    expect(mapping["Some Random Column"]).toBe(IGNORE_TARGET);
  });

  it("never maps two headers to the same target", () => {
    const mapping = autoDetectMapping(["Title", "Task Name"], []);
    const targets = Object.values(mapping).filter((t) => t !== IGNORE_TARGET);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe("buildMappableFields", () => {
  it("includes the fixed fields plus one entry per custom field", () => {
    const fields = buildMappableFields([
      { id: "f1", name: "Customer Type", required: true },
    ]);
    expect(fields.some((f) => f.key === "title" && f.required)).toBe(true);
    expect(
      fields.some((f) => f.key === customFieldTargetKey("f1") && f.required)
    ).toBe(true);
  });
});
