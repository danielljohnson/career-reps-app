import { FITNESS_CATEGORIES } from "@/lib/types";
import {
  CURRENT_SITUATION_OPTIONS,
  FITNESS_CATEGORY_LABELS,
} from "@/lib/surveys";
import { submitSurvey } from "./actions";
import { ScoreSlider } from "./score-slider";

interface SurveyPageProps {
  searchParams: { error?: string };
}

export default function SurveyPage({ searchParams }: SurveyPageProps) {
  const { error } = searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Career fitness survey</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer honestly. Your routine is only as good as your baseline.
        </p>
      </div>

      {error && (
        <p
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      )}

      <form action={submitSurvey} className="flex flex-col gap-8">
        <section className="flex flex-col gap-4 rounded-lg border border-border p-6">
          <h2 className="text-lg font-medium">Your goal</h2>

          <label className="flex flex-col gap-1 text-sm">
            Career goal
            <span className="text-xs text-muted-foreground">
              The role or outcome you&apos;re working toward.
            </span>
            <input
              name="career_goal"
              type="text"
              required
              maxLength={200}
              placeholder="e.g. Senior backend engineer at a Series B startup"
              className="rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Timeline
            <span className="text-xs text-muted-foreground">
              How long you&apos;d like to take to get there.
            </span>
            <input
              name="timeline"
              type="text"
              required
              maxLength={100}
              placeholder="e.g. 3 months"
              className="rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Time available per weekday (minutes)
            <input
              name="minutes_per_weekday"
              type="number"
              required
              min={1}
              max={1440}
              step={1}
              placeholder="e.g. 45"
              className="rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-border p-6">
          <h2 className="text-lg font-medium">Current situation</h2>

          <label className="flex flex-col gap-1 text-sm">
            Which best describes where you are right now?
            <select
              name="current_situation"
              required
              defaultValue=""
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select one
              </option>
              {CURRENT_SITUATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            If &quot;Other&quot;, describe it
            <input
              name="current_situation_other"
              type="text"
              maxLength={200}
              placeholder="e.g. returning after a career break"
              className="rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
        </section>

        <section className="flex flex-col gap-6 rounded-lg border border-border p-6">
          <div>
            <h2 className="text-lg font-medium">Career fitness ratings</h2>
            <p className="text-xs text-muted-foreground">
              Rate yourself 1 (weak) to 10 (strong) in each area. Add context
              if it helps explain the score.
            </p>
          </div>

          {FITNESS_CATEGORIES.map((category) => (
            <div key={category} className="flex flex-col gap-2">
              <ScoreSlider
                name={`${category}_score`}
                label={FITNESS_CATEGORY_LABELS[category]}
              />
              <textarea
                name={`${category}_why`}
                rows={2}
                placeholder="Why this score? (optional)"
                className="rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-border p-6">
          <h2 className="text-lg font-medium">Anything else?</h2>
          <label className="flex flex-col gap-1 text-sm">
            Additional context
            <span className="text-xs text-muted-foreground">Optional</span>
            <textarea
              name="additional_context"
              rows={3}
              className="rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
        </section>

        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Save and continue
        </button>
      </form>
    </main>
  );
}

