"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateRoutine, RoutineGenerationError } from "@/lib/anthropic";
import { loadLatestSurvey } from "@/lib/dashboard";

export interface GenerateRoutineResult {
  ok: boolean;
  error?: string;
}

// Generates a routine from the user's latest survey and persists it. Returns a
// result object (rather than throwing) so the client can show a clear error
// and offer retry. Nothing is written unless a fully valid routine came back,
// and the write itself is atomic, so a failure never leaves partial data.
export async function generateRoutineAction(): Promise<GenerateRoutineResult> {
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
    console.error("Loading survey for generation failed", cause);
    return { ok: false, error: "Could not load your survey. Please try again." };
  }

  if (!survey) {
    return {
      ok: false,
      error: "Fill out the career fitness survey before generating a routine.",
    };
  }

  let routine;
  try {
    routine = await generateRoutine(survey);
  } catch (cause) {
    if (cause instanceof RoutineGenerationError) {
      return { ok: false, error: cause.message };
    }
    console.error("Routine generation failed", cause);
    return {
      ok: false,
      error: "Something went wrong building your routine. Please try again.",
    };
  }

  // Atomic replace: the RPC clears any prior routine and writes the new one in
  // a single transaction, checked against RLS as the calling user.
  const { error: rpcError } = await supabase.rpc("replace_routine", {
    p_survey_id: survey.id,
    p_summary: routine.summary,
    p_days: routine.days,
  });

  if (rpcError) {
    console.error("Persisting routine failed", rpcError);
    return {
      ok: false,
      error: "We built your routine but could not save it. Please try again.",
    };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

