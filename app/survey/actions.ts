"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseSurveyForm, surveyInputToRow } from "@/lib/surveys";

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

  // A user has one active survey for MVP: delete any prior survey first so a
  // failed insert below never leaves two rows behind. If the insert then
  // fails, the user lands back on an empty form and simply resubmits.
  const { error: deleteError } = await supabase
    .from("surveys")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    redirect(`/survey?error=${encodeURIComponent(SAVE_ERROR)}`);
  }

  const { error: insertError } = await supabase
    .from("surveys")
    .insert(surveyInputToRow(user.id, result.data));

  if (insertError) {
    redirect(`/survey?error=${encodeURIComponent(SAVE_ERROR)}`);
  }

  redirect("/dashboard");
}

