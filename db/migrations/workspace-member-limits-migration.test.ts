import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { workspace } from "@/db/schema";

const dir = __dirname;
const journal = JSON.parse(
  readFileSync(join(dir, "meta/_journal.json"), "utf8")
) as { entries: { idx: number; tag: string }[] };

describe("workspace member/guest limits migration", () => {
  const entry = journal.entries.find((e) =>
    e.tag.endsWith("_workspace_member_limits")
  );

  it("is registered in the journal after the task-limit migration", () => {
    expect(entry).toBeDefined();
    const taskLimit = journal.entries.find((e) =>
      e.tag.endsWith("_workspace_max_tasks")
    );
    expect(entry!.idx).toBeGreaterThan(taskLimit!.idx);
    expect(existsSync(join(dir, `${entry!.tag}.sql`))).toBe(true);
  });

  it("only adds nullable columns with no default, so existing workspaces stay unlimited", () => {
    const sql = readFileSync(join(dir, `${entry!.tag}.sql`), "utf8");
    expect(sql).toContain('ADD COLUMN "max_members" integer;');
    expect(sql).toContain('ADD COLUMN "max_guests" integer;');
    expect(sql).not.toMatch(/NOT NULL|DEFAULT/i);
  });

  it("schema columns are nullable without a default", () => {
    const cols = getTableColumns(workspace);
    for (const col of [cols.maxMembers, cols.maxGuests]) {
      expect(col.notNull).toBe(false);
      expect(col.hasDefault).toBe(false);
    }
  });
});
