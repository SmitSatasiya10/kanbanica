import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { workspace } from "@/db/schema";

const dir = __dirname;
const journal = JSON.parse(
  readFileSync(join(dir, "meta/_journal.json"), "utf8")
) as { entries: { idx: number; tag: string }[] };

describe("workspace invite-link controls migration", () => {
  const entry = journal.entries.find((e) =>
    e.tag.endsWith("_workspace_invite_link_controls")
  );

  it("is registered in the journal after the member-limits migration", () => {
    expect(entry).toBeDefined();
    const prev = journal.entries.find((e) =>
      e.tag.endsWith("_workspace_member_limits")
    );
    expect(entry!.idx).toBeGreaterThan(prev!.idx);
    expect(existsSync(join(dir, `${entry!.tag}.sql`))).toBe(true);
  });

  it("existing links stay unlimited: expiry/max nullable, uses defaults to 0", () => {
    const sql = readFileSync(join(dir, `${entry!.tag}.sql`), "utf8");
    expect(sql).toContain('ADD COLUMN "invite_link_expires_at" timestamp with time zone;');
    expect(sql).toContain('ADD COLUMN "invite_link_max_uses" integer;');
    expect(sql).toContain('ADD COLUMN "invite_link_uses" integer DEFAULT 0 NOT NULL;');
  });

  it("schema mirrors the SQL", () => {
    const c = getTableColumns(workspace);
    expect(c.inviteLinkExpiresAt.notNull).toBe(false);
    expect(c.inviteLinkMaxUses.notNull).toBe(false);
    expect(c.inviteLinkUses.notNull).toBe(true);
    expect(c.inviteLinkUses.default).toBe(0);
  });
});
