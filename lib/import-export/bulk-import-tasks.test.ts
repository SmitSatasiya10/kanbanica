import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireEditAccessMock, dbMock } = vi.hoisted(() => ({
  requireEditAccessMock: vi.fn(),
  dbMock: { select: vi.fn(), update: vi.fn(), transaction: vi.fn() },
}));

vi.mock("@/lib/permissions", () => ({
  requireEditAccess: requireEditAccessMock,
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  buildFileRowTitleIndex,
  bulkImportTasks,
} from "@/lib/import-export/bulk-import-tasks";

beforeEach(() => {
  requireEditAccessMock.mockReset();
  dbMock.select.mockReset();
  dbMock.update.mockReset();
  dbMock.transaction.mockReset();
});

describe("bulkImportTasks", () => {
  it("rejects without touching the database when the user lacks edit access", async () => {
    requireEditAccessMock.mockResolvedValue({ error: "Forbidden" });

    const result = await bulkImportTasks(
      "user-1",
      { workspaceId: "ws-1", spaceId: "space-1", listId: "list-1" },
      { Title: "title" },
      [{ rowIndex: 1, row: { Title: "Fix bug" } }]
    );

    expect(result).toEqual({ error: "Forbidden" });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});

describe("buildFileRowTitleIndex", () => {
  it("maps each row's lowercased title to its row index", () => {
    const index = buildFileRowTitleIndex({ Name: "title" }, [
      { rowIndex: 1, row: { Name: "Parent Task" } },
      { rowIndex: 2, row: { Name: "Child Task" } },
    ]);
    expect(index.get("parent task")).toBe(1);
    expect(index.get("child task")).toBe(2);
  });

  it("skips rows with a blank title", () => {
    const index = buildFileRowTitleIndex({ Name: "title" }, [
      { rowIndex: 1, row: { Name: "" } },
    ]);
    expect(index.size).toBe(0);
  });

  it("returns an empty map when no column is mapped to title", () => {
    const index = buildFileRowTitleIndex({ Name: "description" }, [
      { rowIndex: 1, row: { Name: "Something" } },
    ]);
    expect(index.size).toBe(0);
  });
});
