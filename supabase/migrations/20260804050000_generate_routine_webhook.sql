-- Database Webhook: fire the generate-routine Edge Function on new jobs.
--
-- When submit_survey_and_enqueue_job (PR1) inserts a 'pending' routine_jobs
-- row, this AFTER INSERT trigger POSTs the row to the Edge Function, which
-- runs the Anthropic generation off-Vercel and writes the result back via
-- complete_routine_job / fail_routine_job. This is the durable, browser-
-- independent trigger the async redesign requires: it fires from the database
-- the instant the job commits, even if the user has already closed the tab.
--
-- This is the SQL form of a Supabase Database Webhook (pg_net + a trigger).
--
-- SECRET HANDLING (why the key is NOT in this file):
-- The Edge Function has verify_jwt disabled, but the webhook still sends an
-- Authorization: Bearer <service-role key> header per Supabase's documented
-- webhook pattern. Committing the service-role key to git would leak it, so
-- the trigger reads it from Supabase Vault at call time instead. Set it once,
-- out-of-band, against the linked project (documented in the PR deploy
-- checklist), NEVER in a committed migration:
--
--   select vault.create_secret(
--     '<SUPABASE_SERVICE_ROLE_KEY>', 'generate_routine_service_key');
--
-- If the secret is absent the header is sent empty; because verify_jwt is off
-- the call still reaches the function, so a missing secret degrades to an
-- unauthenticated (but functional) invocation rather than a hard failure.

-- pg_net powers outbound HTTP from Postgres; enabling is idempotent.
create extension if not exists pg_net;

-- Trigger function: POST the newly inserted job row to the Edge Function.
-- SECURITY DEFINER so it can read vault.decrypted_secrets (owner: postgres);
-- search_path pinned to '' so every reference is schema-qualified.
create or replace function public.invoke_generate_routine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_key text;
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'generate_routine_service_key'
  limit 1;

  -- Fire-and-forget: pg_net queues the request and returns immediately, so the
  -- enqueue transaction never blocks on generation. `.record` mirrors the
  -- shape of a native Supabase Database Webhook payload the function reads.
  perform net.http_post(
    url := 'https://qgvctwhrzsmhcntzgupd.supabase.co/functions/v1/generate-routine',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

-- Only fire for freshly enqueued jobs. A retry ("Try again" after an error)
-- inserts a new 'pending' row, which re-fires; the completed/failed rows the
-- Edge Function writes are UPDATEs, not INSERTs, so they never re-trigger.
create trigger generate_routine_on_job_insert
  after insert on public.routine_jobs
  for each row
  when (new.status = 'pending')
  execute function public.invoke_generate_routine();

