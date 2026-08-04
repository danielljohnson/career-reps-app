"use client";

import { useState, useTransition } from "react";
import { generateRoutineAction } from "./actions";

interface GenerateRoutineButtonProps {
  // Distinguishes the first-time "generate" CTA from a "regenerate" action so
  // the label and confirmation copy match what the user is about to do.
  variant: "generate" | "regenerate";
}

const COPY = {
  generate: {
    idle: "Generate my 10-day routine",
    pending: "Building your routine\u2026",
  },
  regenerate: {
    idle: "Regenerate routine",
    pending: "Rebuilding your routine\u2026",
  },
} as const;

export function GenerateRoutineButton({ variant }: GenerateRoutineButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateRoutineAction();
      // On success the server revalidates /dashboard and this view is replaced
      // by the rendered routine, so we only need to surface failures here.
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

      {isPending && (
        <p className="text-xs text-muted-foreground">
          Your coach is programming your two-week training block. This can take
          up to a minute.
        </p>
      )}

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

