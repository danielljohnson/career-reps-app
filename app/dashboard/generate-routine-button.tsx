"use client";

import { useState, useTransition } from "react";
import { enqueueRoutineJobAction } from "./actions";

interface GenerateRoutineButtonProps {
  // Distinguishes the first-time "generate" CTA from a "regenerate" action and
  // the error-state "retry" so the label matches what the user is about to do.
  variant: "generate" | "regenerate" | "retry";
}

// Enqueuing is near-instant, so there's no long "building" spinner on the
// button itself — on success the server revalidates and the dashboard swaps
// to the pending state (RoutineJobStatus), which owns the "Building…" copy and
// the live update. The button only needs an in-flight label and error
// surfacing for the brief enqueue round trip.
const COPY = {
  generate: { idle: "Generate my 10-day routine", pending: "Starting\u2026" },
  regenerate: { idle: "Regenerate routine", pending: "Starting\u2026" },
  retry: { idle: "Try again", pending: "Starting\u2026" },
} as const;

export function GenerateRoutineButton({ variant }: GenerateRoutineButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await enqueueRoutineJobAction();
      // On success the server revalidates /dashboard and this view is replaced
      // by the pending "Building your routine…" state, so we only surface
      // failures here.
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    });
  }

  const copy = COPY[variant];

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? copy.pending : copy.idle}
      </button>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}

