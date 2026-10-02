"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateWorkspaceTaskLimit } from "@/app/actions/workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { MAX_TASK_LIMIT, MIN_TASK_LIMIT } from "@/lib/task-limit";

interface LimitsSettingsFormProps {
  maxTasks: number | null;
  used: number;
  workspaceId: string;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string) =>
  `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

export function LimitsSettingsForm({
  workspaceId,
  maxTasks,
  used,
}: LimitsSettingsFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [unlimited, setUnlimited] = useState(maxTasks === null);
  const [value, setValue] = useState(maxTasks === null ? "" : String(maxTasks));

  const parsed = value.trim() === "" ? null : Number(value);
  const valid =
    unlimited ||
    (parsed !== null &&
      Number.isInteger(parsed) &&
      parsed >= MIN_TASK_LIMIT &&
      parsed <= MAX_TASK_LIMIT);
  const belowUsage = !unlimited && valid && parsed !== null && parsed < used;
  const dirty = unlimited ? maxTasks !== null : parsed !== maxTasks;
  // Usage always reflects the *saved* limit (maxTasks), not the unsaved input.
  const percentUsed =
    maxTasks === null ? 0 : Math.round((used / maxTasks) * 100);
  const remaining = maxTasks === null ? null : Math.max(0, maxTasks - used);
  const overBy = maxTasks !== null && used > maxTasks ? used - maxTasks : 0;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateWorkspaceTaskLimit({
        workspaceId,
        maxTasks: unlimited ? null : parsed,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Task limit updated");
      router.refresh();
    });
  }

  return (
    <Card className="[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle className="normal-case tracking-normal text-base font-semibold">
          Task Limits
        </CardTitle>
        <CardDescription>
          Cap how many tasks this workspace can hold.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="max-w-xl space-y-4" onSubmit={handleSave}>
          <div className="space-y-2 rounded-xl border border-base-300 bg-base-200/40 p-4">
            <Label>Current usage</Label>
            {maxTasks === null ? (
              <p className="flex items-baseline gap-1.5">
                <span className="font-semibold text-2xl tabular-nums">
                  {fmt(used)}
                </span>
                <span className="text-sm text-base-content/60">
                  {used === 1 ? "task" : "tasks"} · No limit
                </span>
              </p>
            ) : (
              <>
                <p className="flex items-baseline gap-1.5">
                  <span className="font-semibold text-2xl tabular-nums">
                    {fmt(used)}
                  </span>
                  <span className="text-sm text-base-content/60">
                    / {fmt(maxTasks)} tasks
                  </span>
                </p>
                <Progress className="h-2" value={Math.min(100, percentUsed)} />
                <p className="text-xs text-base-content/60">
                  {percentUsed}% used ·{" "}
                  {overBy > 0
                    ? `${plural(overBy, "task")} over limit`
                    : `${plural(remaining ?? 0, "task")} remaining`}
                </p>
                {overBy > 0 && maxTasks !== null && (
                  <Alert className="rounded-xl after:hidden" variant="warning">
                    <WarningIcon />
                    <AlertTitle>Over the task limit</AlertTitle>
                    <AlertDescription>
                      This workspace is {plural(overBy, "task")} over its limit.
                      Existing tasks are unaffected, but new tasks are blocked
                      until usage falls below {fmt(maxTasks)} or the limit is
                      increased.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="task-limit-unlimited">Unlimited tasks</Label>
              <p className="text-xs text-base-content/60">
                Turn on to remove the workspace task limit.
              </p>
            </div>
            <Switch
              checked={unlimited}
              id="task-limit-unlimited"
              onCheckedChange={setUnlimited}
            />
          </div>

          {!unlimited && (
            <div className="space-y-1.5">
              <Label htmlFor="task-limit">Task Limit</Label>
              <Input
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                id="task-limit"
                inputMode="numeric"
                max={MAX_TASK_LIMIT}
                min={MIN_TASK_LIMIT}
                onChange={(e) => setValue(e.target.value)}
                placeholder="10000"
                step={1}
                type="number"
                value={value}
              />
              {!valid && value.trim() !== "" && (
                <p className="text-xs text-error">
                  Enter a whole number between {fmt(MIN_TASK_LIMIT)} and{" "}
                  {fmt(MAX_TASK_LIMIT)}.
                </p>
              )}
              {belowUsage && (
                <p className="text-xs text-warning">
                  This is below current usage ({fmt(used)}). Existing tasks are
                  kept, but no new tasks can be created until usage drops below
                  the limit.
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-base-content/60">
            Every task counts, including active, completed, archived, and
            subtasks. Deleting tasks frees capacity; archiving does not.
          </p>

          <Button
            className="gap-2"
            disabled={pending || !valid || !dirty}
            type="submit"
          >
            {pending && <Spinner className="size-4" />}
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
