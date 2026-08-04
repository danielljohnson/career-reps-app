// generate-routine: the async routine-generation background worker.
//
// Triggered by a Supabase Database Webhook on INSERT into public.routine_jobs
// (see supabase/migrations/*_generate_routine_webhook.sql). The webhook POSTs
// the Postgres row-change payload; `.record` is the newly inserted job row.
//
// Flow, per the design doc (art_i82ODQKB §3-§4):
//   1. Read job id / survey id / user id from the payload record.
//   2. Build a service-role Supabase client (bypasses RLS) from the
//      auto-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
//   3. Claim the job: flip pending -> processing, but only if still pending
//      (guards against at-least-once webhook double-delivery).
//   4. Load the survey, call Anthropic, validate the JSON.
//   5. On success rpc("complete_routine_job"); on ANY error
//      rpc("fail_routine_job"). The handler never throws uncaught: every job
//      resolves to complete or error so no user is stranded on "Building...".
//
// verify_jwt is disabled for this function (see supabase/config.toml): the
// webhook authenticates with the service-role key, not a user JWT.

import Anthropic from "npm:@anthropic-ai/sdk@0.115.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  buildRoutinePrompt,
  parseRoutineResponse,
  type SurveyRow,
  surveyRowToSurvey,
  SYSTEM_PROMPT,
} from "./_shared/routines.ts";

// Model config kept IDENTICAL to lib/anthropic.ts so the Edge path and the
// legacy Vercel path produce the same shape of routine.
// keep in sync with lib/anthropic.ts
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4000;

// Unlike the Vercel path (capped at the Free plan's 60s function budget, so
// REQUEST_TIMEOUT_MS had to stay at 50s), Edge Functions get 150s wall-clock
// on the Free plan. A generous per-request timeout still keeps a hung request
// from riding the SDK's 10-minute default and burning the whole invocation.
const REQUEST_TIMEOUT_MS = 120_000;

// The row-change payload shape Supabase Database Webhooks deliver.
interface RoutineJobRecord {
  id: string;
  user_id: string;
  survey_id: string;
  status: string;
}

interface WebhookPayload {
  type?: string;
  table?: string;
  record?: RoutineJobRecord;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Concatenates the text blocks of a Messages response into a single string.
function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

Deno.serve(async (req) => {
  // Parse the webhook payload up front. Without a usable job id we cannot fail
  // the job either, so this is the one path that returns an error response.
  let record: RoutineJobRecord | undefined;
  try {
    const payload = (await req.json()) as WebhookPayload;
    record = payload.record;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON payload" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!record?.id || !record.survey_id || !record.user_id) {
    return new Response(
      JSON.stringify({ error: "Payload missing routine_jobs record fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const jobId = record.id;

  // Service-role client: bypasses RLS so it can read any survey and call the
  // service_role-only complete/fail RPCs. SUPABASE_URL and
  // SUPABASE_SERVICE_ROLE_KEY are auto-injected into every Edge Function.
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  try {
    // Claim the job: pending -> processing, but only while still pending. The
    // filtered update is atomic, so a redelivered webhook (at-least-once) that
    // finds the row already processing/terminal updates zero rows and we skip.
    const { data: claimed, error: claimError } = await supabase
      .from("routine_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) {
      // Another delivery already claimed or finished this job. Not an error.
      return new Response(
        JSON.stringify({ skipped: true, reason: "job not pending" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Load the survey that seeds the prompt.
    const { data: surveyRow, error: surveyError } = await supabase
      .from("surveys")
      .select("*")
      .eq("id", record.survey_id)
      .maybeSingle();

    if (surveyError) throw surveyError;
    if (!surveyRow) throw new Error(`Survey ${record.survey_id} not found`);

    const survey = surveyRowToSurvey(surveyRow as SurveyRow);

    // Call Anthropic. Single attempt: the fence-tolerant parser makes one solid
    // attempt reliable, matching lib/anthropic.ts (MAX_ATTEMPTS = 1).
    const anthropic = new Anthropic({
      apiKey: requireEnv("ANTHROPIC_API_KEY"),
      timeout: REQUEST_TIMEOUT_MS,
    });

    const message = await anthropic.messages.create({
      model: Deno.env.get("ANTHROPIC_MODEL") ?? DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildRoutinePrompt(survey) }],
    });

    const parsed = parseRoutineResponse(extractText(message));
    if ("error" in parsed) {
      throw new Error(`Model returned an unusable routine (${parsed.error}).`);
    }

    // Persist atomically and flip the job to complete. complete_routine_job is
    // SECURITY DEFINER + service_role-only and idempotent against redelivery.
    const { error: completeError } = await supabase.rpc("complete_routine_job", {
      p_job_id: jobId,
      p_summary: parsed.data.summary,
      p_days: parsed.data.days,
    });

    if (completeError) throw completeError;

    return new Response(
      JSON.stringify({ ok: true, job_id: jobId }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (cause) {
    // Never leave a job stuck: record the failure so the dashboard can show an
    // error state with a "Try again" path. fail_routine_job is idempotent.
    const messageText =
      cause instanceof Error ? cause.message : "Unknown generation error";
    console.error(`generate-routine job ${jobId} failed:`, cause);

    const { error: failError } = await supabase.rpc("fail_routine_job", {
      p_job_id: jobId,
      p_error: messageText,
    });

    if (failError) {
      // Both generation and the fail-write broke: log loudly for support. The
      // job stays processing and the smoke test / monitoring surfaces it.
      console.error(`generate-routine could not mark job ${jobId} failed:`, failError);
    }

    // 200 so at-least-once webhook delivery does not keep retrying a job we
    // have already resolved to error; the failure lives in the job row.
    return new Response(
      JSON.stringify({ ok: false, job_id: jobId, error: messageText }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});

