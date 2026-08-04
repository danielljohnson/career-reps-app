// Survey form parsing, validation, and DB row mapping. Kept framework-free
// (no Next.js imports) so the same logic runs client-side hints and again as
// the server's line of defense before anything reaches the database.

import {
  FITNESS_CATEGORIES,
  type FitnessCategory,
  type Survey,
  type SurveyInput,
} from "@/lib/types";

// Sensible preset situations plus a free-text "other" escape hatch, per spec.
export const CURRENT_SITUATION_OPTIONS = [
  { value: "employed_quiet", label: "Employed and searching quietly" },
  { value: "recently_laid_off", label: "Recently laid off" },
  { value: "career_changer", label: "Career changer" },
  { value: "new_grad", label: "New grad" },
  { value: "other", label: "Other" },
] as const;

export const FITNESS_CATEGORY_LABELS: Record<FitnessCategory, string> = {
  goal_clarity: "Goal clarity",
  network_strength: "Network strength",
  impact_visibility: "Impact visibility",
  industry_awareness: "Industry awareness",
};

const MAX_MINUTES_PER_WEEKDAY = 24 * 60;

export type SurveyParseResult = { data: SurveyInput } | { error: string };

function readText(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function readOptionalText(formData: FormData, field: string): string | null {
  const value = readText(formData, field);
  return value.length > 0 ? value : null;
}

function parseScore(
  formData: FormData,
  category: FitnessCategory,
): number | null {
  const raw = readText(formData, `${category}_score`);
  if (raw.length === 0) return null;
  const score = Number(raw);
  if (!Number.isInteger(score) || score < 1 || score > 10) return null;
  return score;
}

// The select carries a stable slug; "other" defers to the free-text field.
// Stored value is always a human-readable description, since that's what
// gets injected into the routine-generation prompt.
function resolveCurrentSituation(formData: FormData): string | null {
  const selected = readText(formData, "current_situation");
  const option = CURRENT_SITUATION_OPTIONS.find((o) => o.value === selected);
  if (!option) return null;

  if (option.value === "other") {
    return readOptionalText(formData, "current_situation_other");
  }

  return option.label;
}

// Parses and validates raw form data into a SurveyInput. HTML constraints
// (required, min, max) give the user fast feedback in the browser; this is
// the check that actually gates what reaches the database.
export function parseSurveyForm(formData: FormData): SurveyParseResult {
  const careerGoal = readText(formData, "career_goal");
  if (!careerGoal) {
    return { error: "Enter the career goal you're training for." };
  }

  const timeline = readText(formData, "timeline");
  if (!timeline) {
    return { error: "Enter the timeline you'd like to achieve it in." };
  }

  const minutesPerWeekday = Number(readText(formData, "minutes_per_weekday"));
  if (
    !Number.isInteger(minutesPerWeekday) ||
    minutesPerWeekday <= 0 ||
    minutesPerWeekday > MAX_MINUTES_PER_WEEKDAY
  ) {
    return {
      error: "Enter a realistic number of minutes per weekday (1-1440).",
    };
  }

  const currentSituation = resolveCurrentSituation(formData);
  if (!currentSituation) {
    return {
      error:
        "Select your current situation, or describe your own if you chose Other.",
    };
  }

  const ratings = {} as SurveyInput["ratings"];
  for (const category of FITNESS_CATEGORIES) {
    const score = parseScore(formData, category);
    if (score === null) {
      return {
        error: `Rate ${FITNESS_CATEGORY_LABELS[category].toLowerCase()} from 1 to 10.`,
      };
    }
    ratings[category] = {
      score,
      why: readOptionalText(formData, `${category}_why`),
    };
  }

  return {
    data: {
      careerGoal,
      timeline,
      minutesPerWeekday,
      currentSituation,
      additionalContext: readOptionalText(formData, "additional_context"),
      ratings,
    },
  };
}

// The shape of a surveys table row as returned by Supabase (snake_case).
export interface SurveyRow {
  id: string;
  user_id: string;
  career_goal: string;
  timeline: string;
  minutes_per_weekday: number;
  current_situation: string;
  additional_context: string | null;
  goal_clarity_score: number;
  goal_clarity_why: string | null;
  network_strength_score: number;
  network_strength_why: string | null;
  impact_visibility_score: number;
  impact_visibility_why: string | null;
  industry_awareness_score: number;
  industry_awareness_why: string | null;
  created_at: string;
}

// Maps a persisted surveys row back to the camelCase domain type. Used by
// routine generation, which reads the latest survey to build the prompt.
export function surveyRowToSurvey(row: SurveyRow): Survey {
  return {
    id: row.id,
    userId: row.user_id,
    careerGoal: row.career_goal,
    timeline: row.timeline,
    minutesPerWeekday: row.minutes_per_weekday,
    currentSituation: row.current_situation,
    additionalContext: row.additional_context,
    createdAt: row.created_at,
    ratings: {
      goal_clarity: {
        score: row.goal_clarity_score,
        why: row.goal_clarity_why,
      },
      network_strength: {
        score: row.network_strength_score,
        why: row.network_strength_why,
      },
      impact_visibility: {
        score: row.impact_visibility_score,
        why: row.impact_visibility_why,
      },
      industry_awareness: {
        score: row.industry_awareness_score,
        why: row.industry_awareness_why,
      },
    },
  };
}

// Maps a validated SurveyInput to the argument list of the
// submit_survey_and_enqueue_job RPC, which atomically inserts the survey and
// enqueues a routine_jobs row. Arg names mirror the function's parameters
// exactly; keep in sync with the routine_jobs migration.
export function surveyInputToEnqueueArgs(input: SurveyInput) {
  return {
    p_career_goal: input.careerGoal,
    p_timeline: input.timeline,
    p_minutes_per_weekday: input.minutesPerWeekday,
    p_current_situation: input.currentSituation,
    p_additional_context: input.additionalContext,
    p_goal_clarity_score: input.ratings.goal_clarity.score,
    p_goal_clarity_why: input.ratings.goal_clarity.why,
    p_network_strength_score: input.ratings.network_strength.score,
    p_network_strength_why: input.ratings.network_strength.why,
    p_impact_visibility_score: input.ratings.impact_visibility.score,
    p_impact_visibility_why: input.ratings.impact_visibility.why,
    p_industry_awareness_score: input.ratings.industry_awareness.score,
    p_industry_awareness_why: input.ratings.industry_awareness.why,
  };
}

// Maps a validated SurveyInput to the surveys table's snake_case columns.
export function surveyInputToRow(userId: string, input: SurveyInput) {
  return {
    user_id: userId,
    career_goal: input.careerGoal,
    timeline: input.timeline,
    minutes_per_weekday: input.minutesPerWeekday,
    current_situation: input.currentSituation,
    additional_context: input.additionalContext,
    goal_clarity_score: input.ratings.goal_clarity.score,
    goal_clarity_why: input.ratings.goal_clarity.why,
    network_strength_score: input.ratings.network_strength.score,
    network_strength_why: input.ratings.network_strength.why,
    impact_visibility_score: input.ratings.impact_visibility.score,
    impact_visibility_why: input.ratings.impact_visibility.why,
    industry_awareness_score: input.ratings.industry_awareness.score,
    industry_awareness_why: input.ratings.industry_awareness.why,
  };
}

