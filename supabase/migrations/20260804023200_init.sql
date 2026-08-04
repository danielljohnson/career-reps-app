-- Career Reps foundation schema.
-- Domain: a user completes a survey, which produces a routine of 10 workdays,
-- each day holding an ordered list of tasks the user marks complete.
-- Every table has Row Level Security so a user can only touch their own rows.

-- Profiles: one row per auth user, created automatically on signup.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are selectable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Profiles are insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Surveys: the career-fitness intake. One-to-many per user (kept as history).
create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  career_goal text not null,
  timeline text not null,
  minutes_per_weekday int not null check (minutes_per_weekday > 0),
  current_situation text not null,
  additional_context text,
  goal_clarity_score int not null check (goal_clarity_score between 1 and 10),
  goal_clarity_why text,
  network_strength_score int not null check (network_strength_score between 1 and 10),
  network_strength_why text,
  impact_visibility_score int not null check (impact_visibility_score between 1 and 10),
  impact_visibility_why text,
  industry_awareness_score int not null check (industry_awareness_score between 1 and 10),
  industry_awareness_why text,
  created_at timestamptz not null default now()
);

create index surveys_user_id_idx on public.surveys (user_id);

alter table public.surveys enable row level security;

create policy "Surveys are readable by owner"
  on public.surveys for select
  using (auth.uid() = user_id);

create policy "Surveys are insertable by owner"
  on public.surveys for insert
  with check (auth.uid() = user_id);

create policy "Surveys are updatable by owner"
  on public.surveys for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Surveys are deletable by owner"
  on public.surveys for delete
  using (auth.uid() = user_id);

-- Routines: the generated coaching plan tied to the survey that produced it.
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  survey_id uuid not null references public.surveys (id) on delete cascade,
  summary text not null,
  status text not null default 'ready'
    check (status in ('generating', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create index routines_user_id_idx on public.routines (user_id);
create index routines_survey_id_idx on public.routines (survey_id);

alter table public.routines enable row level security;

create policy "Routines are readable by owner"
  on public.routines for select
  using (auth.uid() = user_id);

create policy "Routines are insertable by owner"
  on public.routines for insert
  with check (auth.uid() = user_id);

create policy "Routines are updatable by owner"
  on public.routines for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Routines are deletable by owner"
  on public.routines for delete
  using (auth.uid() = user_id);

-- Routine days: the 10 workday blocks, each with a short scannable label.
create table public.routine_days (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  day_number int not null check (day_number between 1 and 10),
  summary text not null,
  unique (routine_id, day_number)
);

create index routine_days_routine_id_idx on public.routine_days (routine_id);

alter table public.routine_days enable row level security;

-- Ownership is inherited from the parent routine's user_id.
create policy "Routine days are readable by owner"
  on public.routine_days for select
  using (
    exists (
      select 1 from public.routines r
      where r.id = routine_days.routine_id and r.user_id = auth.uid()
    )
  );

create policy "Routine days are insertable by owner"
  on public.routine_days for insert
  with check (
    exists (
      select 1 from public.routines r
      where r.id = routine_days.routine_id and r.user_id = auth.uid()
    )
  );

create policy "Routine days are updatable by owner"
  on public.routine_days for update
  using (
    exists (
      select 1 from public.routines r
      where r.id = routine_days.routine_id and r.user_id = auth.uid()
    )
  );

create policy "Routine days are deletable by owner"
  on public.routine_days for delete
  using (
    exists (
      select 1 from public.routines r
      where r.id = routine_days.routine_id and r.user_id = auth.uid()
    )
  );

-- Tasks: the individual reps. completed_at toggles for mark-complete / undo.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  routine_day_id uuid not null references public.routine_days (id) on delete cascade,
  task text not null,
  why text not null,
  fitness_category text not null check (
    fitness_category in (
      'goal_clarity',
      'network_strength',
      'impact_visibility',
      'industry_awareness'
    )
  ),
  position int not null default 0,
  completed_at timestamptz
);

create index tasks_routine_day_id_idx on public.tasks (routine_day_id);

alter table public.tasks enable row level security;

-- Ownership is inherited through routine_days -> routines -> user_id.
create policy "Tasks are readable by owner"
  on public.tasks for select
  using (
    exists (
      select 1
      from public.routine_days d
      join public.routines r on r.id = d.routine_id
      where d.id = tasks.routine_day_id and r.user_id = auth.uid()
    )
  );

create policy "Tasks are insertable by owner"
  on public.tasks for insert
  with check (
    exists (
      select 1
      from public.routine_days d
      join public.routines r on r.id = d.routine_id
      where d.id = tasks.routine_day_id and r.user_id = auth.uid()
    )
  );

create policy "Tasks are updatable by owner"
  on public.tasks for update
  using (
    exists (
      select 1
      from public.routine_days d
      join public.routines r on r.id = d.routine_id
      where d.id = tasks.routine_day_id and r.user_id = auth.uid()
    )
  );

create policy "Tasks are deletable by owner"
  on public.tasks for delete
  using (
    exists (
      select 1
      from public.routine_days d
      join public.routines r on r.id = d.routine_id
      where d.id = tasks.routine_day_id and r.user_id = auth.uid()
    )
  );

