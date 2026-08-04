import Link from "next/link";
import { logout } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { loadLatestRoutine, loadLatestSurvey } from "@/lib/dashboard";
import { FITNESS_CATEGORY_LABELS } from "@/lib/surveys";
import type { Routine } from "@/lib/types";
import { GenerateRoutineButton } from "./generate-routine-button";

// Routine generation runs inside a server action triggered from this route, so
// the budget lives on the route segment. It must cover the whole retry loop:
// MAX_ATTEMPTS (2) * REQUEST_TIMEOUT_MS (45s) in lib/anthropic.ts = 90s. Keep
// these in lockstep so a retried generation can't outlive the function.
export const maxDuration = 90;

// The dashboard is the home base after login. For this PR it wires up routine
// generation and renders the stored routine read-only; the day-by-day task
// tracker (mark complete / undo) lands in a later PR.
export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already gates /dashboard behind auth; this guards the types and
  // covers the edge where the session drops between middleware and render.
  if (!user) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          Your session expired.{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to continue.
        </p>
      </Shell>
    );
  }

  const [survey, routine] = await Promise.all([
    loadLatestSurvey(supabase, user.id),
    loadLatestRoutine(supabase, user.id),
  ]);

  return (
    <Shell>
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Sign out
          </button>
        </form>
      </header>

      {!survey ? (
        <EmptySurveyState />
      ) : routine ? (
        <RoutineView routine={routine} />
      ) : (
        <GenerateState />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      {children}
    </main>
  );
}

// No survey yet: the routine can't be built without a baseline, so send the
// user to take it first.
function EmptySurveyState() {
  return (
    <section className="flex flex-col items-center gap-4 rounded-lg border border-border p-8 text-center">
      <h2 className="text-lg font-medium">Start with your baseline</h2>
      <p className="text-sm text-muted-foreground">
        Take the career fitness survey and your coach will program your first
        two-week training block.
      </p>
      <Link
        href="/survey"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Take the survey
      </Link>
    </section>
  );
}

// Survey done, no routine yet: this is the trigger point right after the survey
// flow hands off. One click generates the routine, with loading and retry
// handled by the client button.
function GenerateState() {
  return (
    <section className="flex flex-col items-center gap-4 rounded-lg border border-border p-8 text-center">
      <h2 className="text-lg font-medium">Your baseline is in</h2>
      <p className="text-sm text-muted-foreground">
        Time to program your routine. Your coach will build ten workdays of
        reps tuned to your weakest fitness categories.
      </p>
      <GenerateRoutineButton variant="generate" />
    </section>
  );
}

// Routine ready: show the coaching summary and every day's tasks read-only.
function RoutineView({ routine }: { routine: Routine }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-muted p-6">
        <h2 className="text-lg font-medium">Your training plan</h2>
        <p className="mt-2 text-sm">{routine.summary}</p>
      </div>

      <ol className="flex flex-col gap-4">
        {routine.days.map((day) => (
          <li
            key={day.id}
            className="flex flex-col gap-3 rounded-lg border border-border p-5"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-sm font-semibold">
                Day {day.dayNumber}
                {day.dayNumber === 1 ? " · Today" : ""}
              </h3>
              <span className="text-sm text-muted-foreground">
                {day.summary}
              </span>
            </div>

            <ul className="flex flex-col gap-3">
              {day.tasks.map((task) => (
                <li key={task.id} className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{task.task}</p>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {FITNESS_CATEGORY_LABELS[task.fitnessCategory]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{task.why}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <div className="flex flex-col items-center gap-2 border-t border-border pt-6">
        <p className="text-xs text-muted-foreground">
          Want a different block? Regenerating replaces this routine.
        </p>
        <GenerateRoutineButton variant="regenerate" />
      </div>
    </section>
  );
}

