import { WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface TaskLimitBannerProps {
  capacity?: { limit: number | null; used: number };
  isAdmin: boolean;
  workspaceId: string;
}

/** Share of the limit at which Owners/Admins get a heads-up. */
const WARN_THRESHOLD = 0.9;

const fmt = (n: number) => n.toLocaleString("en-US");

// Display only — the real limit is enforced server-side by requireTaskCapacity.
// ≥90%: Owner/Admin heads-up. 100%: everyone, since members need to know why
// creating tasks fails.
export function TaskLimitBanner({
  capacity,
  isAdmin,
  workspaceId,
}: TaskLimitBannerProps) {
  if (!capacity || capacity.limit === null) {
    return null;
  }
  const { limit, used } = capacity;
  const reached = used >= limit;
  const approaching = !reached && used >= limit * WARN_THRESHOLD;

  if (!(reached || (approaching && isAdmin))) {
    return null;
  }

  return (
    <div className="border-b border-base-300 bg-app px-4 py-2">
      <Alert className="rounded-xl after:hidden" variant="warning">
        <WarningIcon />
        <AlertTitle>
          {reached
            ? "Workspace task limit reached"
            : `Your workspace is approaching its task limit (${fmt(used)} / ${fmt(limit)})`}
        </AlertTitle>
        <AlertDescription>
          {reached
            ? `${fmt(used)} / ${fmt(limit)} tasks. New tasks can't be created until tasks are deleted (archived tasks still count)${isAdmin ? " or the limit is raised." : "; ask a workspace admin to raise the limit."}`
            : "Archived tasks count toward the limit."}
          {isAdmin && (
            <>
              {" "}
              <Link href={`/${workspaceId}/settings/limits`}>Manage limit</Link>
            </>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
