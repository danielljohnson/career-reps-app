"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RoutineJobStatus } from "@/lib/types";

interface RoutineJobStatusProps {
  jobId: string;
  // Server-rendered status this component is seeded with. The dashboard only
  // mounts this for 'pending'/'processing', so the initial value is always one
  // of those; it distinguishes the microcopy shown while waiting.
  initialStatus: Extract<RoutineJobStatus, "pending" | "processing">;
}

// How often we re-resolve server state as a safety net. Realtime is the
// primary channel, but a websocket that never connects, drops, or misses the
// exact UPDATE that flips the job terminal would otherwise leave the tab stuck
// on "Building…" forever. A slow refresh guarantees eventual correctness
// without meaningful request volume (this only runs while a job is active).
const SAFETY_REFRESH_MS = 10_000;

// Live view for an in-flight routine job. The dashboard already resolved and
// rendered the correct state server-side (so a fresh visit is always correct);
// this layers a Realtime subscription on top so an open tab flips to the
// finished routine (or error) without a manual refresh. On any terminal
// transition it calls router.refresh(), which re-runs the dashboard's server
// resolution — that render either shows the routine or the error state and
// unmounts this component.
export function RoutineJobStatus({ jobId, initialStatus }: RoutineJobStatusProps) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`routine-job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "routine_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const status = (payload.new as { status?: string }).status;
          if (status === "complete" || status === "error") {
            router.refresh();
          }
        },
      )
      .subscribe();

    // Belt-and-suspenders against a missed Realtime event: periodically
    // re-resolve server state until this component unmounts (which happens as
    // soon as the job leaves pending/processing).
    const interval = setInterval(() => router.refresh(), SAFETY_REFRESH_MS);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [jobId, router]);

  return (
    <section className="flex flex-col items-center gap-4 rounded-lg border border-border p-8 text-center">
      <span
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
      />
      <h2 className="text-lg font-medium">Building your routine…</h2>
      <p className="text-sm text-muted-foreground">
        {initialStatus === "processing"
          ? "Your coach is programming your two-week training block. This can take about half a minute — hang tight."
          : "Your coach is programming your two-week training block. This can take about half a minute — come back anytime."}
      </p>
    </section>
  );
}

