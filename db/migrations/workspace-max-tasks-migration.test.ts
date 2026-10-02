import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { workspace } from "@/db/schema";

const dir = __dirname;
const journal = JSON.parse(
  readFileSync(join(dir, "meta/_journal.json"), "utf8")
) as { entries: { idx: number; tag: string }[] };

describe("workspace.max_tasks migration", () => {
  const entry = journal.entries.find((e) => e.tag.endsWith("_workspace_max_tasks"));

  it("is registered in the journal and its SQL file exists", () => {
    expect(entry).toBeDefined();
    expect(existsSync(join(dir, `${entry!.tag}.sql`))).toBe(true);
  });

  it("only adds a nullable column with no default, so existing workspaces stay unlimited", () => {
    const sql = readFileSync(join(dir, `${entry!.tag}.sql`), "utf8").trim();
    expect(sql).toBe('ALTER TABLE "workspace" ADD COLUMN "max_tasks" integer;');
    expect(sql).not.toMatch(/NOT NULL|DEFAULT/i);
  });

  it("schema column is nullable without a default", () => {
    const col = getTableColumns(workspace).maxTasks;
    expect(col.notNull).toBe(false);
    expect(col.hasDefault).toBe(false);
  });
});

describe("migration journal consistency", () => {
  it("has sequential idx values and a SQL file + snapshot for every entry", () => {
    journal.entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
      expect(e.tag.startsWith(String(i).padStart(4, "0"))).toBe(true);
      expect(existsSync(join(dir, `${e.tag}.sql`))).toBe(true);
      expect(existsSync(join(dir, `meta/${String(i).padStart(4, "0")}_snapshot.json`))).toBe(true);
    });
  });
});
