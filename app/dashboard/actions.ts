"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadLatestSurvey } from "@/lib/dashboard";

export interface EnqueueRoutineJobResult {
  ok: boolean;
  error?: string;
}

// Postgres unique_violation: the partial unique index on routine_jobs rejects
// a second active (pending/processing) job for the same survey.
const UNIQUE_VIOLATION = "23505";

// Enqueues a routine-generation job for the user's latest survey and returns
// immediately — the long Anthropic call runs off-Vercel in an Edge Function
// triggered by the inserted row, so nothing here blocks. Used by the manual
// "Generate" fallback CTA, the "Regenerate" action, and the error-state "Try
// again": each just adds a fresh pending row. Returns a result object rather
// than throwing so the client can surface a clear error.
export async function enqueueRoutineJobAction(): Promise<EnqueueRoutineJobResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  let survey;
  try {
    survey = await loadLatestSurvey(supabase, user.id);
  } catch (cause) {
    console.error("Loading survey for enqueue failed", cause);
    return { ok: false, error: "Could not load your survey. Please try again." };
  }

  if (!survey) {
    return {
      ok: false,
      error: "Fill out the career fitness survey before generating a routine.",
    };
  }

  // Insert is RLS-checked against the "insertable by owner" policy, so a user
  // can only ever enqueue against their own survey.
  const { error } = await supabase
    .from("routine_jobs")
    .insert({ user_id: user.id, survey_id: survey.id, status: "pending" });

  if (error) {
    // A concurrent active job already exists (double-click, second tab): that
    // job will still generate the routine, so treat it as success rather than
    // surfacing a confusing error.
    if (error.code === UNIQUE_VIOLATION) {
      revalidatePath("/dashboard");
      return { ok: true };
    }
    console.error("Enqueuing routine job failed", error);
    return {
      ok: false,
      error: "Could not start routine generation. Please try again.",
    };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export interface ToggleTaskResult {
  ok: boolean;
  error?: string;
}

// Toggles a single task's completed_at. The update itself carries no explicit
// ownership filter because the "Tasks are updatable by owner" RLS policy
// already scopes it (via routine_days -> routines -> user_id): a caller can
// never touch a task they don't own. Selecting the updated row back lets us
// tell "updated" apart from "RLS silently matched zero rows" (wrong id, or
// someone else's task), which a bare update-with-no-error would otherwise hide.
export async function toggleTaskAction(
  taskId: string,
  completed: boolean,
): Promise<ToggleTaskResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", taskId)
    .select("id");

  if (error) {
    console.error("Toggling task failed", error);
    return { ok: false, error: "Could not update task. Please try again." };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "Task not found." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

