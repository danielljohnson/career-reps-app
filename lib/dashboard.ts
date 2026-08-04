import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { surveyRowToSurvey, type SurveyRow } from "@/lib/surveys";
import type {
  FitnessCategory,
  Routine,
  RoutineDay,
  RoutineStatus,
  Survey,
  Task,
} from "@/lib/types";

// Raw nested-select rows as PostgREST returns them (snake_case, child arrays).
interface TaskRow {
  id: string;
  routine_day_id: string;
  task: string;
  why: string;
  fitness_category: string;
  position: number;
  completed_at: string | null;
}

interface RoutineDayRow {
  id: string;
  routine_id: string;
  day_number: number;
  summary: string;
  tasks: TaskRow[];
}

interface RoutineRow {
  id: string;
  user_id: string;
  survey_id: string;
  summary: string;
  status: string;
  created_at: string;
  routine_days: RoutineDayRow[];
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    routineDayId: row.routine_day_id,
    task: row.task,
    why: row.why,
    fitnessCategory: row.fitness_category as FitnessCategory,
    position: row.position,
    completedAt: row.completed_at,
  };
}

function mapDay(row: RoutineDayRow): RoutineDay {
  return {
    id: row.id,
    routineId: row.routine_id,
    dayNumber: row.day_number,
    summary: row.summary,
    // Nested-select order is not guaranteed, so sort tasks explicitly.
    tasks: [...row.tasks].sort((a, b) => a.position - b.position).map(mapTask),
  };
}

function mapRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    userId: row.user_id,
    surveyId: row.survey_id,
    summary: row.summary,
    status: row.status as RoutineStatus,
    createdAt: row.created_at,
    days: [...row.routine_days]
      .sort((a, b) => a.day_number - b.day_number)
      .map(mapDay),
  };
}

// Loads the user's most recent survey, or null if they haven't taken one.
export async function loadLatestSurvey(
  supabase: SupabaseClient,
  userId: string,
): Promise<Survey | null> {
  const { data, error } = await supabase
    .from("surveys")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? surveyRowToSurvey(data as SurveyRow) : null;
}

// Loads the user's most recent routine with its days and tasks, or null.
export async function loadLatestRoutine(
  supabase: SupabaseClient,
  userId: string,
): Promise<Routine | null> {
  const { data, error } = await supabase
    .from("routines")
    .select(
      "id, user_id, survey_id, summary, status, created_at, " +
        "routine_days(id, routine_id, day_number, summary, " +
        "tasks(id, routine_day_id, task, why, fitness_category, position, completed_at))",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRoutine(data as unknown as RoutineRow) : null;
}

