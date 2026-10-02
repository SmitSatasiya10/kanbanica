"use client";

import { PlusIcon } from "@phosphor-icons/react";
import * as React from "react";
import { toast } from "sonner";
import { addTaskToSprint } from "@/app/actions/sprint";
import { createTask } from "@/app/actions/task";
import {
  EMPTY_QUICK_META,
  QuickTaskMeta,
  type QuickTaskMetaValue,
  quickMetaCreateFields,
} from "@/components/task/quick-task-meta";
import { Button } from "@/components/ui/button";
import { isWithinAnyOpenLayer } from "@/components/ui/overlay-stack";

interface QuickCreateTaskProps {
  className?: string;
  listId: string;
  placeholder?: string;
  spaceId: string;
  statuses?: { id: string; name: string; color: string }[];
  statusId?: string;
  workspaceId: string;
}

export function QuickCreateTask({
  workspaceId,
  spaceId,
  listId,
  statusId,
  statuses = [],
  placeholder = "Add task…",
  className,
}: QuickCreateTaskProps) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [meta, setMeta] = React.useState<QuickTaskMetaValue>(EMPTY_QUICK_META);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  function show() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const close = React.useCallback(() => {
    setOpen(false);
    setTitle("");
    setMeta(EMPTY_QUICK_META);
  }, []);

  // Dismiss the composer when clicking anywhere outside it (same as Cancel).
  // Clicks inside the composer's own portaled overlays — the Assignee/Priority/
  // due-date popovers, which render outside this DOM subtree — must NOT close it.
  React.useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target || loading) {
        return;
      }
      if (containerRef.current?.contains(target)) {
        return;
      }
      if (isWithinAnyOpenLayer(target)) {
        return;
      }
      close();
    }
    // `mousedown` (not `click`) so it fires before focus/selection changes.
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, loading, close]);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      close();
      return;
    }
    setLoading(true);
    const res = await createTask(workspaceId, spaceId, listId, {
      title: trimmed,
      statusId,
      ...quickMetaCreateFields(meta),
    });
    if (res && "error" in res) {
      // Keep the typed title/meta so nothing is lost (e.g. workspace task limit).
      toast.error(res.error);
      setLoading(false);
      inputRef.current?.focus();
      return;
    }
    // Sprint isn't a createTask field — assign it right after, reusing the
    // existing action.
    if (res && "taskId" in res && meta.sprintId) {
      await addTaskToSprint(workspaceId, spaceId, meta.sprintId, res.taskId);
    }
    setLoading(false);
    // Keep the form open for rapid entry; reset for the next task.
    setTitle("");
    setMeta(EMPTY_QUICK_META);
    inputRef.current?.focus();
  }

  if (!open) {
    return (
      <button
        className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-base-content/60 text-sm transition-colors hover:border-base-300 hover:bg-base-200 hover:text-base-content w-full ${className ?? ""}`}
        onClick={show}
        type="button"
      >
        <PlusIcon className="size-4 shrink-0" />
        {placeholder}
      </button>
    );
  }

  return (
    <div
      className={`space-y-2 rounded-lg border bg-base-100 px-3 py-2 shadow-sm ${className ?? ""}`}
      ref={containerRef}
    >
      <input
        className="w-full bg-transparent text-sm outline-none placeholder:text-base-content/60"
        disabled={loading}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            close();
          }
        }}
        placeholder={placeholder}
        ref={inputRef}
        value={title}
      />

      <QuickTaskMeta
        onChange={setMeta}
        spaceId={spaceId}
        statuses={statuses}
        value={meta}
        workspaceId={workspaceId}
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-base-content/60 whitespace-nowrap">
          Enter to save · Esc to cancel
        </p>
        <div className="flex gap-1.5 shrink-0">
          <Button onClick={close} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={loading || !title.trim()}
            onClick={submit}
            size="sm"
            type="button"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
