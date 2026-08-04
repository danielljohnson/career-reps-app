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

Row Level Security is enabled on every table; policies scope access to the
owning user (directly via `user_id`, or inherited through the parent routine).

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

