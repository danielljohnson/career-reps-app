import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadLatestRoutineJob } from "@/lib/dashboard";

// A routine_jobs row as PostgREST returns it (snake_case).
const jobRow = {
  id: "job-1",
  user_id: "user-1",
  survey_id: "survey-1",
  status: "pending",
  error_message: null,
  routine_id: null,
  created_at: "2026-08-04T12:00:00Z",
  updated_at: "2026-08-04T12:05:00Z",
};

// Fake Supabase client: every builder method returns the same chainable object
// and maybeSingle resolves the canned response, matching the query shape
// loadLatestRoutineJob builds (from -> select -> eq -> order -> limit ->
// maybeSingle).
function fakeSupabase(response: {
  data: unknown;
  error: unknown;
}): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(response),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe("loadLatestRoutineJob", () => {
  it("maps a snake_case row into a camelCase RoutineJob", async () => {
    const supabase = fakeSupabase({ data: jobRow, error: null });

    const job = await loadLatestRoutineJob(supabase, "user-1");

    expect(job).toEqual({
      id: "job-1",
      userId: "user-1",
      surveyId: "survey-1",
      status: "pending",
      errorMessage: null,
      routineId: null,
      createdAt: "2026-08-04T12:00:00Z",
      updatedAt: "2026-08-04T12:05:00Z",
    });
  });

  it("returns null when the user has no job", async () => {
    const supabase = fakeSupabase({ data: null, error: null });

    expect(await loadLatestRoutineJob(supabase, "user-1")).toBeNull();
  });

  it("throws when the query errors", async () => {
    const supabase = fakeSupabase({ data: null, error: new Error("boom") });

    await expect(loadLatestRoutineJob(supabase, "user-1")).rejects.toThrow(
      "boom",
    );
  });
});

