// Pure (client-safe) task-limit constants and helpers — no DB imports.

/** Valid range for `workspace.maxTasks` when a limit is set (null = unlimited). */
export const MIN_TASK_LIMIT = 1;
export const MAX_TASK_LIMIT = 10_000_000;

/** Machine-readable marker on capacity rejections (import confirm maps it to HTTP 409). */
export const TASK_LIMIT_CODE = "TASK_LIMIT_REACHED" as const;

export type TaskLimitError = { error: string; code: typeof TASK_LIMIT_CODE };

/** One shared message for every creation path (server actions + import confirm). */
export function taskLimitReachedMessage(limit: number): string {
  return `Workspace task limit reached (${limit.toLocaleString("en-US")}). Ask a workspace admin to raise the limit, or delete tasks to free up space. Archived tasks still count.`;
}

/** True when `value` is a legal limit: an integer in [MIN_TASK_LIMIT, MAX_TASK_LIMIT]. */
export function isValidTaskLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_TASK_LIMIT &&
    value <= MAX_TASK_LIMIT
  );
}
