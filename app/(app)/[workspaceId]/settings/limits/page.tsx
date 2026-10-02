import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { LimitsSettingsForm } from "@/components/workspace/limits-settings-form";
import { LimitsTabs } from "@/components/workspace/limits-tabs";
import { MemberLimitsSettingsForm } from "@/components/workspace/member-limits-settings-form";
import { PRODUCT_NAME } from "@/config/platform";
import { workspace } from "@/db/schema";
import { db } from "@/lib/db";
import {
  getWorkspaceMemberCapacity,
  getWorkspaceTaskUsage,
} from "@/lib/workspace-limits";

interface LimitsSettingsPageProps {
  params: Promise<{ workspaceId: string }>;
}

export const metadata = { title: `Limits — ${PRODUCT_NAME}` };

export default async function LimitsSettingsPage({
  params,
}: LimitsSettingsPageProps) {
  const { workspaceId } = await params;

  const [ws] = await db
    .select({ id: workspace.id, maxTasks: workspace.maxTasks })
    .from(workspace)
    .where(eq(workspace.id, workspaceId));

  if (!ws) {
    notFound();
  }

  const [used, capacity] = await Promise.all([
    getWorkspaceTaskUsage(workspaceId),
    getWorkspaceMemberCapacity(workspaceId),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">Limits</h2>
        <p className="text-base-content/60 text-sm">
          Manage workspace capacity limits.
        </p>
      </div>
      <LimitsTabs
        tabs={[
          {
            value: "tasks",
            label: "Tasks",
            description: "Task capacity",
            content: (
              <LimitsSettingsForm
                maxTasks={ws.maxTasks}
                used={used}
                workspaceId={ws.id}
              />
            ),
          },
          {
            value: "members",
            label: "Members & Guests",
            description: "People capacity",
            content: (
              <MemberLimitsSettingsForm
                guests={{
                  limit: capacity.guests.limit,
                  used: capacity.guests.used,
                }}
                members={{
                  limit: capacity.members.limit,
                  used: capacity.members.used,
                }}
                workspaceId={ws.id}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
