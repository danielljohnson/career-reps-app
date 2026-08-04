// Pure, framework-free resolution of the dashboard's current state from the
// three durable inputs (latest survey, latest routine job, latest routine).
//
// This runs server-side on every dashboard load, so a user who closed the tab
// mid-generation and returns later (or on another device) always sees the
// correct state reconstructed from the database, never a stale "just
// submitted" client flag or a socket message that may have been missed. It is
// kept out of lib/dashboard.ts (which is server-only) so it can be unit tested
// under Vitest's plain-Node environment.

import type { Routine, RoutineJob, Survey } from "@/lib/types";

export type DashboardState =
  | { kind: "no-survey" }
  | { kind: "no-job" }
  | { kind: "pending"; job: RoutineJob }
  | { kind: "processing"; job: RoutineJob }
  | { kind: "complete"; routine: Routine }
  | { kind: "error"; job: RoutineJob };

export interface DashboardInputs {
  survey: Survey | null;
  job: RoutineJob | null;
  routine: Routine | null;
}

// Resolves exactly one of the five dashboard states (plus the no-survey
// pre-state). The latest job's status drives the outcome; a ready routine is
// the authoritative tiebreaker for the completed case only (design doc §6):
// it represents "what's on the dashboard", covering both a complete job whose
// routine was later superseded by a manual regenerate and pre-migration
// routines that predate the job table entirely.
export function resolveDashboardState(input: DashboardInputs): DashboardState {
  const { survey, job, routine } = input;

  if (!survey) {
    return { kind: "no-survey" };
  }

  switch (job?.status) {
    case "pending":
      return { kind: "pending", job };
    case "processing":
      return { kind: "processing", job };
    case "error":
      return { kind: "error", job };
    case "complete":
    case undefined:
      // A completed job, or no job at all (pre-migration data): the routine
      // row itself is authoritative. Absent one, a complete job with no
      // routine is an anomaly — fall back to the manual generate CTA so the
      // user can recover.
      return routine
        ? { kind: "complete", routine }
        : { kind: "no-job" };
  }
}

