// Survey form parsing, validation, and DB row mapping. Kept framework-free
// (no Next.js imports) so the same logic runs client-side hints and again as
// the server's line of defense before anything reaches the database.

import {
  FITNESS_CATEGORIES,
  type FitnessCategory,
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

