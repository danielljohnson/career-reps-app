// Shared domain types for Career Reps. Later PRs (auth, survey, routine
// generation, dashboard) import from here so the data model stays consistent.

export const FITNESS_CATEGORIES = [
  "goal_clarity",
  "network_strength",
  "impact_visibility",
  "industry_awareness",
] as const;

export type FitnessCategory = (typeof FITNESS_CATEGORIES)[number];

// 1-10 self-rating a user gives each fitness category, with optional context.
export interface FitnessRating {
  score: number;
  why: string | null;
}

// What the survey form collects before it is persisted (no ids/timestamps).
export interface SurveyInput {
  careerGoal: string;
  timeline: string;
  minutesPerWeekday: number;
  currentSituation: string;
  additionalContext: string | null;
  ratings: Record<FitnessCategory, FitnessRating>;
}

// A persisted survey row (mirrors the surveys table).
export interface Survey extends SurveyInput {
  id: string;
  userId: string;
  createdAt: string;
}

export type RoutineStatus = "generating" | "ready" | "failed";

export interface Task {
  id: string;
  routineDayId: string;
  task: string;
  why: string;
  fitnessCategory: FitnessCategory;
  position: number;
  completedAt: string | null;
}

export interface RoutineDay {
  id: string;
  routineId: string;
  dayNumber: number;
  summary: string;
  tasks: Task[];
}

export interface Routine {
  id: string;
  userId: string;
  surveyId: string;
  summary: string;
  status: RoutineStatus;
  createdAt: string;
  days: RoutineDay[];
}

// Lifecycle of an async routine-generation job (mirrors the routine_jobs
// table's status check): a survey submit enqueues 'pending', the Edge Function
// claims it as 'processing', then writes a terminal 'complete' or 'error'.
export type RoutineJobStatus =
  | "pending"
  | "processing"
  | "complete"
  | "error";

// A persisted routine_jobs row: the durable orchestration record the dashboard
// reads to resolve its state on every load, independent of any live socket.
export interface RoutineJob {
  id: string;
  userId: string;
  surveyId: string;
  status: RoutineJobStatus;
  errorMessage: string | null;
  routineId: string | null;
  createdAt: string;
  updatedAt: string;
}

// The JSON shape the Anthropic API returns, matching the spec OUTPUT FORMAT
// exactly (snake_case, fitness_category enum). Validate before trusting it.
export interface GeneratedTask {
  task: string;
  why: string;
  fitness_category: FitnessCategory;
}

export interface GeneratedDay {
  day: number;
  summary: string;
  tasks: GeneratedTask[];
}

export interface GeneratedRoutine {
  summary: string;
  days: GeneratedDay[];
}

