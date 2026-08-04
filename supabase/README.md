# Supabase

Auth and Postgres for Career Reps. Schema lives in `migrations/` as timestamped
SQL files applied in filename order.

## Data model

- `profiles` — one row per auth user, created automatically by the
  `on_auth_user_created` trigger on `auth.users`.
- `surveys` — career-fitness intake (goal, timeline, minutes/weekday, current
  situation, and a 1-10 score + optional "why" for each of the four fitness
  categories).
- `routines` — a generated coaching plan tied to the survey that produced it.
- `routine_days` — the ten workday blocks, each with a short label.
- `tasks` — the individual reps; `completed_at` toggles for mark-complete/undo.
- `routine_jobs` — durable background-job records for async routine generation
  (`pending` → `processing` → `complete` | `error`). Survey submit enqueues a
  job instantly instead of generating inline; a Supabase Edge Function
  (`service_role`) picks it up, calls Anthropic off-Vercel, and writes the
  result back. Purely an orchestration record — the routine itself still lives
  in `routines`/`routine_days`/`tasks`, linked via `routine_jobs.routine_id`.

Row Level Security is enabled on every table; policies scope access to the
owning user (directly via `user_id`, or inherited through the parent routine).
Users may `select` and `insert` their own `routine_jobs` but never `update` or
`delete` them — only `service_role` transitions a job's status.

## Routine RPCs

All routine writes go through Postgres functions so multi-table writes
(`routines` → `routine_days` → `tasks`) happen atomically in one transaction.

- `replace_routine(p_survey_id, p_summary, p_days)` — `SECURITY INVOKER`;
  replaces the caller's routine for a survey (RLS-checked as the caller). Used
  by the legacy synchronous generation path.
- `submit_survey_and_enqueue_job(...)` — `SECURITY INVOKER`; atomically
  replaces the caller's survey and enqueues a `pending` `routine_jobs` row,
  returning the job id. The instant-return path behind survey submit.
- `complete_routine_job(p_job_id, p_summary, p_days)` — `SECURITY DEFINER`,
  `service_role` only. Called by the Edge Function on success: writes the
  routine (mirroring `replace_routine`) and flips the job to `complete`.
  Idempotent against at-least-once webhook retries (no-ops if already terminal).
- `fail_routine_job(p_job_id, p_error)` — `SECURITY DEFINER`, `service_role`
  only. Called by the Edge Function on failure: flips the job to `error` with a
  message. Idempotent.

`complete_routine_job`/`fail_routine_job` are `EXECUTE`-revoked from `public`,
`anon`, and `authenticated`, and granted only to `service_role`, so a logged-in
user can never forge or vandalize another user's job. `routine_jobs` is in the
`supabase_realtime` publication so the dashboard can subscribe to its own job's
status transitions live.

## Apply migrations locally

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then:

```bash
# Start a local Postgres + Auth stack (requires Docker).
supabase start

# Apply every migration in migrations/ to the local database.
supabase db reset
```

`supabase db reset` drops the local database and re-runs all migrations from
scratch, so it is the quickest way to load a clean schema during development.

## Apply migrations to a hosted project

```bash
# Link this repo to your Supabase project (run once).
supabase link --project-ref <your-project-ref>

# Push pending migrations to the linked project.
supabase db push
```

Copy `.env.example` to `.env.local` and fill in the project URL and keys from
the Supabase dashboard (Project Settings -> API).

