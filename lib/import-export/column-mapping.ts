import type { CustomFieldRow } from "@/app/actions/custom-field";

// Fixed Kanbanica fields a CSV column can map to. Custom fields are appended
// dynamically (one entry per applicable field definition) since the list
// determines which exist — see `buildMappableFields`.
export const IMPORT_FIELD_KEYS = [
  "title",
  "description",
  "status",
  "priority",
  "assignees",
  "dueDateStart",
  "dueDateEnd",
  "tags",
  "parentTask",
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

// A custom-field mapping target is namespaced so it can't collide with a
// fixed field key or another field's id.
export function customFieldTargetKey(fieldId: string): string {
  return `customField:${fieldId}`;
}

export function isCustomFieldTarget(target: string): string | null {
  return target.startsWith("customField:") ? target.slice(12) : null;
}

export interface MappableField {
  key: string;
  label: string;
  required: boolean;
}

export const IGNORE_TARGET = "__ignore__";

export const FIXED_MAPPABLE_FIELDS: MappableField[] = [
  { key: "title", label: "Title", required: true },
  { key: "description", label: "Description", required: false },
  { key: "status", label: "Status", required: false },
  { key: "priority", label: "Priority", required: false },
  { key: "assignees", label: "Assignee(s)", required: false },
  { key: "dueDateStart", label: "Due Date (Start)", required: false },
  { key: "dueDateEnd", label: "Due Date (End)", required: false },
  { key: "tags", label: "Tags", required: false },
  { key: "parentTask", label: "Parent Task", required: false },
];

// All fields a CSV column may be mapped to, for the current list: the fixed
// set plus one entry per applicable (non-archived) custom field definition.
export function buildMappableFields(
  customFields: Pick<CustomFieldRow, "id" | "name" | "required">[]
): MappableField[] {
  return [
    ...FIXED_MAPPABLE_FIELDS,
    ...customFields.map((f) => ({
      key: customFieldTargetKey(f.id),
      label: f.name,
      required: f.required,
    })),
  ];
}

const HEADER_ALIASES: Record<ImportFieldKey, string[]> = {
  title: ["title", "task name", "task title", "task", "name"],
  description: ["description", "details", "notes"],
  status: ["status", "state"],
  priority: ["priority"],
  assignees: ["assignee", "assignees", "assigned to", "owner"],
  dueDateStart: ["start date", "due date start", "start"],
  dueDateEnd: ["due date", "due date end", "due", "deadline", "end date"],
  tags: ["tags", "labels"],
  parentTask: ["parent task", "parent", "parent id"],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ");
}

// Case-insensitive, punctuation-tolerant best-effort mapping from CSV headers
// to Kanbanica fields. A header that doesn't match anything (fixed field or
// custom field name) maps to IGNORE_TARGET — the user can always override in
// the mapping UI, this just saves the common case.
export function autoDetectMapping(
  headers: string[],
  customFields: Pick<CustomFieldRow, "id" | "name">[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedTargets = new Set<string>();

  const customByName = new Map(
    customFields.map((f) => [normalizeHeader(f.name), f.id])
  );

  for (const header of headers) {
    const normalized = normalizeHeader(header);

    let matchedKey: string | null = null;
    for (const key of IMPORT_FIELD_KEYS) {
      if (HEADER_ALIASES[key].includes(normalized) && !usedTargets.has(key)) {
        matchedKey = key;
        break;
      }
    }

    if (!matchedKey) {
      const customFieldId = customByName.get(normalized);
      if (customFieldId) {
        const target = customFieldTargetKey(customFieldId);
        if (!usedTargets.has(target)) {
          matchedKey = target;
        }
      }
    }

    mapping[header] = matchedKey ?? IGNORE_TARGET;
    if (matchedKey) {
      usedTargets.add(matchedKey);
    }
  }

  return mapping;
}
