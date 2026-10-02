import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireViewAccessMock, dbMock } = vi.hoisted(() => ({
  requireViewAccessMock: vi.fn(),
  dbMock: { select: vi.fn() },
}));

vi.mock("@/lib/permissions", () => ({
  requireViewAccess: requireViewAccessMock,
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/app/actions/custom-field", () => ({
  getCustomFieldsForTasks: vi.fn(),
}));

import { getExportableTasks } from "@/lib/import-export/export-tasks";

beforeEach(() => {
  requireViewAccessMock.mockReset();
  dbMock.select.mockReset();
});

describe("getExportableTasks", () => {
  it("rejects without querying tasks when the user lacks view access", async () => {
    requireViewAccessMock.mockResolvedValue({ error: "Forbidden" });

    const result = await getExportableTasks("user-1", {
      workspaceId: "ws-1",
      spaceId: "space-1",
    });

    expect(result).toEqual({ error: "Forbidden" });
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});
