"use client";

import { useState, useTransition } from "react";
import { toggleTaskAction } from "./actions";
import { FITNESS_CATEGORY_LABELS } from "@/lib/surveys";
import type { Task } from "@/lib/types";

interface TaskItemProps {
  task: Task;
}

// One task with a mark-complete / undo checkbox. The check flips immediately
// (optimistic) so the tap feels instant, then reverts with an inline error if
// the server update fails, so the UI never shows a "done" state that didn't
// actually persist.
export function TaskItem({ task }: TaskItemProps) {
  const [completed, setCompleted] = useState(task.completedAt !== null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !completed;
    setCompleted(next);
    setError(null);
    startTransition(async () => {
      const result = await toggleTaskAction(task.id, next);
      if (!result.ok) {
        setCompleted(!next);
        setError(result.error ?? "Could not update task. Please try again.");
      }
    });
  }

  return (
    <li className="flex flex-col gap-1 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <label className="flex flex-1 items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={completed}
            onChange={handleToggle}
            disabled={isPending}
            aria-label={
              completed ? "Mark task incomplete" : "Mark task complete"
            }
            className="mt-0.5 shrink-0"
          />
          <span
            className={completed ? "text-muted-foreground line-through" : ""}
          >
            {task.task}
          </span>
        </label>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {FITNESS_CATEGORY_LABELS[task.fitnessCategory]}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{task.why}</p>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-border bg-muted px-2 py-1 text-xs"
        >
          {error}
        </p>
      )}
    </li>
  );
}

