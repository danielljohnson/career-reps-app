"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseSurveyForm, surveyInputToEnqueueArgs } from "@/lib/surveys";

const SAVE_ERROR = "Could not save your survey. Please try again.";

export async function submitSurvey(formData: FormData) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = parseSurveyForm(formData);
  if ("error" in result) {
    redirect(`/survey?error=${encodeURIComponent(result.error)}`);
  }

  // Instant-return enqueue: one atomic RPC replaces the user's prior survey
  // (MVP keeps a single active survey), inserts the new one, and enqueues a
  // pending routine_jobs row — all RLS-checked as the calling user. Generation
  // itself runs off-Vercel in an Edge Function, so we never await it here; the
  // user is redirected to the dashboard immediately and the durable job row
  // reconstructs "Building your routine…" state on any later load.
  const { error: enqueueError } = await supabase.rpc(
    "submit_survey_and_enqueue_job",
    surveyInputToEnqueueArgs(result.data),
  );

  if (enqueueError) {
    console.error("Submitting survey and enqueuing job failed", enqueueError);
    redirect(`/survey?error=${encodeURIComponent(SAVE_ERROR)}`);
  }

  redirect("/dashboard");
}

