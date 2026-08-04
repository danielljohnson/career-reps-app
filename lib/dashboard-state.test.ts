import { describe, expect, it } from "vitest";

import { resolveDashboardState } from "@/lib/dashboard-state";
import type { Routine, RoutineJob, RoutineJobStatus, Survey } from "@/lib/types";

// Minimal fixtures: the resolver only inspects presence and job.status, so the
// rest of each shape is filler cast to the domain type.
const survey = { id: "survey-1" } as Survey;
const routine = { id: "routine-1" } as Routine;

function jobWith(status: RoutineJobStatus): RoutineJob {
  return {
    id: `job-${status}`,
    userId: "user-1",
    surveyId: "survey-1",
    status,
    errorMessage: status === "error" ? "boom" : null,
    routineId: status === "complete" ? "routine-1" : null,
    createdAt: "2026-08-04T12:00:00Z",
    updatedAt: "2026-08-04T12:00:00Z",
  };
}

describe("resolveDashboardState", () => {
  it("returns no-survey when the user has not taken the survey", () => {
    expect(
      resolveDashboardState({ survey: null, job: null, routine: null }),
    ).toEqual({ kind: "no-survey" });
  });

  it("returns no-job when a survey exists but nothing has been enqueued", () => {
    expect(
      resolveDashboardState({ survey, job: null, routine: null }),
    ).toEqual({ kind: "no-job" });
  });

  it("returns pending while the job waits to be picked up", () => {
    const job = jobWith("pending");
    expect(resolveDashboardState({ survey, job, routine: null })).toEqual({
      kind: "pending",
      job,
    });
  });

  it("returns processing while the Edge Function is generating", () => {
    const job = jobWith("processing");
    expect(resolveDashboardState({ survey, job, routine: null })).toEqual({
      kind: "processing",
      job,
    });
  });

  it("returns error when the latest job failed", () => {
    const job = jobWith("error");
    expect(resolveDashboardState({ survey, job, routine: null })).toEqual({
      kind: "error",
      job,
    });
  });

  it("returns complete when a job finished and its routine exists", () => {
    const job = jobWith("complete");
    expect(resolveDashboardState({ survey, job, routine })).toEqual({
      kind: "complete",
      routine,
    });
  });

  it("lets a ready routine take precedence over a superseded complete job", () => {
    // A complete job whose routine was later replaced by a manual regenerate:
    // the routine row is authoritative for what's on the dashboard.
    const job = jobWith("complete");
    expect(resolveDashboardState({ survey, job, routine }).kind).toBe(
      "complete",
    );
  });

  it("shows a routine that predates the job table (no job row)", () => {
    expect(
      resolveDashboardState({ survey, job: null, routine }),
    ).toEqual({ kind: "complete", routine });
  });

  it("falls back to no-job for a complete job with no routine (anomaly)", () => {
    const job = jobWith("complete");
    expect(
      resolveDashboardState({ survey, job, routine: null }),
    ).toEqual({ kind: "no-job" });
  });

  it("keeps showing the building state for an active regenerate over an old routine", () => {
    // User regenerated: a new pending job while the prior routine still exists.
    // Active generation wins so the user gets live feedback.
    const job = jobWith("pending");
    expect(resolveDashboardState({ survey, job, routine }).kind).toBe(
      "pending",
    );
  });
});

