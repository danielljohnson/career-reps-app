-- Async routine generation: durable background-job orchestration.
--
-- Survey submit must return instantly, so generation can no longer run inline
-- inside a Vercel server action (that path times out at 60s). Instead a
-- routine_jobs row is enqueued; a Supabase Edge Function (service_role) picks
-- it up, calls Anthropic off-Vercel, and writes the result back. This table is
-- purely a status/orchestration record -- the routine itself still lives in
-- routines -> routine_days -> tasks, unchanged.
--
-- Lifecycle: pending -> processing -> complete | error.

create table public.routine_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  survey_id uuid not null references public.surveys (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'complete', 'error')),
  error_message text,
  routine_id uuid references public.routines (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routine_jobs_user_id_idx on public.routine_jobs (user_id);
create index routine_jobs_survey_id_idx on public.routine_jobs (survey_id);

-- At most one *active* job per survey: a double-click retry or a second tab
-- must not enqueue a concurrent generation for the same survey. Terminal rows
-- (complete/error) are excluded, so "Try again" after a failure inserts freely.
create unique index routine_jobs_survey_active_uniq
  on public.routine_jobs (survey_id)
  where status in ('pending', 'processing');

alter table public.routine_jobs enable row level security;

create policy "Routine jobs are readable by owner"
  on public.routine_jobs for select
  using (auth.uid() = user_id);

create policy "Routine jobs are insertable by owner"
  on public.routine_jobs for insert
  with check (auth.uid() = user_id);

-- Deliberately no update/delete policy for authenticated users: only the Edge
-- Function (service_role, which bypasses RLS entirely) transitions a job's
-- status, via the two SECURITY DEFINER functions below. A user can create a
-- job and read it, never mutate it.

-- complete_routine_job: called by the Edge Function (service_role) once
-- generation succeeds. A service-role client has no auth.uid(), so it cannot
-- use the SECURITY INVOKER replace_routine RPC; this SECURITY DEFINER function
-- reads ownership from the trusted job row instead (that row was already
-- insert-checked against RLS when the user enqueued it).
--
-- Idempotent: Database Webhooks deliver at-least-once, so a retried delivery
-- must not double-write. We lock the job row FOR UPDATE and no-op (returning
-- the existing routine_id) if it is already terminal.
create function public.complete_routine_job(
  p_job_id uuid,
  p_summary text,
  p_days jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_survey_id uuid;
  v_status text;
  v_existing_routine_id uuid;
  v_routine_id uuid;
  v_day jsonb;
  v_day_id uuid;
  v_task jsonb;
  v_position int;
begin
  select user_id, survey_id, status, routine_id
    into v_user_id, v_survey_id, v_status, v_existing_routine_id
  from public.routine_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Routine job % not found', p_job_id;
  end if;

  -- Already finished (retried delivery or manual re-run): no-op, return what we
  -- have so the caller still sees a consistent routine id.
  if v_status in ('complete', 'error') then
    return v_existing_routine_id;
  end if;

  -- Mirror replace_routine's insert sequence exactly so the two stay
  -- consistent: clear any prior routine for the survey (cascades to days and
  -- tasks), insert one routines row, then loop days -> tasks.
  delete from public.routines
  where survey_id = v_survey_id and user_id = v_user_id;

  insert into public.routines (user_id, survey_id, summary, status)
  values (v_user_id, v_survey_id, p_summary, 'ready')
  returning id into v_routine_id;

  for v_day in select * from jsonb_array_elements(p_days)
  loop
    insert into public.routine_days (routine_id, day_number, summary)
    values (
      v_routine_id,
      (v_day ->> 'day')::int,
      v_day ->> 'summary'
    )
    returning id into v_day_id;

    v_position := 0;
    for v_task in select * from jsonb_array_elements(v_day -> 'tasks')
    loop
      insert into public.tasks (
        routine_day_id, task, why, fitness_category, position
      )
      values (
        v_day_id,
        v_task ->> 'task',
        v_task ->> 'why',
        v_task ->> 'fitness_category',
        v_position
      );
      v_position := v_position + 1;
    end loop;
  end loop;

  update public.routine_jobs
  set status = 'complete',
      routine_id = v_routine_id,
      error_message = null,
      updated_at = now()
  where id = p_job_id;

  return v_routine_id;
end;
$$;

-- fail_routine_job: called by the Edge Function (service_role) when generation
-- fails. Idempotent for the same reasons as complete_routine_job -- a job that
-- already reached a terminal state is left untouched.
create function public.fail_routine_job(
  p_job_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.routine_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Routine job % not found', p_job_id;
  end if;

  if v_status in ('complete', 'error') then
    return;
  end if;

  update public.routine_jobs
  set status = 'error',
      error_message = p_error,
      updated_at = now()
  where id = p_job_id;
end;
$$;

-- SECURITY DEFINER functions are callable by any authenticated PostgREST caller
-- by default. Without this lockdown, any logged-in user could complete or fail
-- another user's job by id -- forging a routine or vandalizing a job. Restrict
-- both to service_role only (the Edge Function's identity), mirroring why
-- replace_routine deliberately stayed SECURITY INVOKER instead of DEFINER.
revoke execute on function public.complete_routine_job(uuid, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.fail_routine_job(uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_routine_job(uuid, text, jsonb)
  to service_role;
grant execute on function public.fail_routine_job(uuid, text)
  to service_role;

-- submit_survey_and_enqueue_job: the instant-return enqueue path used by survey
-- submit. Atomically deletes any prior survey (MVP keeps one active survey per
-- user), inserts the new survey, and enqueues a pending routine_jobs row for
-- it, returning the job id. SECURITY INVOKER so every write is RLS-checked as
-- the calling user -- a user can only ever enqueue against their own survey.
-- Survey columns mirror surveyInputToRow in lib/surveys.ts exactly.
create function public.submit_survey_and_enqueue_job(
  p_career_goal text,
  p_timeline text,
  p_minutes_per_weekday int,
  p_current_situation text,
  p_additional_context text,
  p_goal_clarity_score int,
  p_goal_clarity_why text,
  p_network_strength_score int,
  p_network_strength_why text,
  p_impact_visibility_score int,
  p_impact_visibility_why text,
  p_industry_awareness_score int,
  p_industry_awareness_why text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_survey_id uuid;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- One active survey per user for MVP: clear any prior survey first (cascades
  -- to its routine and any active jobs) so we never leave two rows behind.
  delete from public.surveys where user_id = v_user_id;

  insert into public.surveys (
    user_id,
    career_goal,
    timeline,
    minutes_per_weekday,
    current_situation,
    additional_context,
    goal_clarity_score,
    goal_clarity_why,
    network_strength_score,
    network_strength_why,
    impact_visibility_score,
    impact_visibility_why,
    industry_awareness_score,
    industry_awareness_why
  )
  values (
    v_user_id,
    p_career_goal,
    p_timeline,
    p_minutes_per_weekday,
    p_current_situation,
    p_additional_context,
    p_goal_clarity_score,
    p_goal_clarity_why,
    p_network_strength_score,
    p_network_strength_why,
    p_impact_visibility_score,
    p_impact_visibility_why,
    p_industry_awareness_score,
    p_industry_awareness_why
  )
  returning id into v_survey_id;

  insert into public.routine_jobs (user_id, survey_id, status)
  values (v_user_id, v_survey_id, 'pending')
  returning id into v_job_id;

  return v_job_id;
end;
$$;

-- Realtime live updates: the dashboard subscribes to status transitions on its
-- own job row so pending/processing flips to complete/error without a manual
-- refresh. The Postgres Changes stream is RLS-aware, so the owner-only SELECT
-- policy above is the only authorization needed.
alter publication supabase_realtime add table public.routine_jobs;

