-- Routine persistence RPC.
-- Writing a routine touches three tables (routines -> routine_days -> tasks).
-- Doing that from the client in separate calls risks partial data if one call
-- fails midway. This function performs the whole replace in a single
-- transaction, so the routine is either written completely or not at all.
--
-- SECURITY INVOKER (the default): the function runs as the calling user, so
-- every insert is still checked against the existing RLS policies and a user
-- can only ever write their own rows.

create function public.replace_routine(
  p_survey_id uuid,
  p_summary text,
  p_days jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_routine_id uuid;
  v_day jsonb;
  v_day_id uuid;
  v_task jsonb;
  v_position int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- The survey must belong to the caller; this also anchors ownership of the
  -- routine we are about to create.
  if not exists (
    select 1 from public.surveys s
    where s.id = p_survey_id and s.user_id = v_user_id
  ) then
    raise exception 'Survey not found for current user';
  end if;

  -- One routine per survey for MVP: clear any prior routine (cascades to its
  -- days and tasks) so regenerating replaces cleanly instead of stacking.
  delete from public.routines
  where survey_id = p_survey_id and user_id = v_user_id;

  insert into public.routines (user_id, survey_id, summary, status)
  values (v_user_id, p_survey_id, p_summary, 'ready')
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

  return v_routine_id;
end;
$$;

