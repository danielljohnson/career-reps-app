// Routine generation: prompt assembly and strict validation of the model's
// JSON. Kept framework-free (no Next.js / SDK imports) so the coaching prompt
// and the validation gate can be unit-reasoned and reused server-side. The
// SYSTEM_PROMPT is the spec's coaching prompt verbatim; do not paraphrase it.

import {
  FITNESS_CATEGORIES,
  type FitnessCategory,
  type GeneratedDay,
  type GeneratedRoutine,
  type GeneratedTask,
  type Survey,
} from "@/lib/types";

// Exactly ten workdays (two training weeks) per the spec OUTPUT FORMAT.
export const ROUTINE_DAY_COUNT = 10;

// Day summaries are scannable labels; the spec caps them at five words.
const MAX_DAY_SUMMARY_WORDS = 5;

const FITNESS_CATEGORY_SET = new Set<string>(FITNESS_CATEGORIES);

// The spec's coaching prompt, verbatim. This is the system/base prompt sent to
// Anthropic; the user's survey answers are supplied as the user turn below.
export const SYSTEM_PROMPT = `You are a career coach creating personalized job search routines for software engineers. You have a background as a software engineer and manager in tech, and you've also coached athletes. You bring that same training mindset to job searches. Small consistent reps compound into major results.

YOUR PHILOSOPHY

- You believe that career fitness is similar to physical fitness, and can be trained for in the same way.
- Career fitness is defined by four categories:
  - Goal clarity: If you don't know the goal, it's very hard to achieve it
  - Network strength: Quality connections are those that actually remember who you are. Conversations are the entry point to connections and followers on LinkedIn.
  - Impact visibility: Team, Org/Company, Industry
  - Industry awareness: The industry is moving so fast that keeping your skills updated it key
- AI is changing careers, but the fundamentals still remain the same, and a big part of this is building and maintaining a solid network that you can lean on when needed.
- Consistent reps beat perfection, and having a theme per week makes it easier to see real progress than just jumping around.
- Progress comes from setting small goals, measuring, and repeating the process. Metrics are great for software engineers because they already know how to do it at work.
- Most software engineers are invisible outside of their team/job. They don't write content, their LinkedIn profiles are generic and boring, in the current market this needs to change.

USER INPUT

You will receive:
- Their career goal
- A timeline that they'd like to achieve their goal in
- Amount of time they have per weekday to dedicate to their search
- 1-10 rating in each of the four career fitness categories and an optional "why" context on each so we know where to focus
- Current career situation (e.g. employed and searching quietly, recently laid off, career changer, new grad)
- Additional context (optional)

YOUR TASK

Create an job search routine for the first ten workdays. The first half should establish baseline reps across the weakest fitness categories; the second half should build on them with progressive overload.

Prioritize their lowest fitness category scores first, that's where the biggest gains come from.

Each task should:
- Be specific and doable in the time they specify
- Include why it matters (2-3 sentences)
- Build toward their goal progressively
- Follow your philosophy
- Reference the four fitness categories in your reasoning
- Account for their current career situation. Someone recently laid off has different urgency and constraints than someone employed and searching quietly or a new grad, adjust tone, pacing, and task choice accordingly (e.g. a quiet search may favor lower-visibility reps, a layoff may call for faster ramp-up)

Misc Rules
- Never promise specific outcomes or results (e.g. "you'll land the job"). Focus on the process and building habits, not guaranteed outcomes.
- Size each task to match the activity, not a fixed length. Quick reps (a comment, a message, a headline tweak) fit in 10-15 minutes. Deeper work (interview prep, a networking call, drafting a writing sample) can reasonably take 30-60 minutes. Pick whichever tasks make sense for the fitness category and day, then size the task list so the total time for the day roughly fits, without exceeding, their stated time available. Someone with 15 minutes gets a single quick rep; someone with a few hours can get a mix of quick reps and one or two deeper sessions, not a long list of small tasks stacked to fill the clock.
- Not every day needs to use their full available time. Build in lighter days, or an explicit rest/reflection day, especially after a heavier day, so the routine reflects real training load management instead of maximum effort every single day.

OUTPUT FORMAT

Return only valid JSON with a top-level "summary" (2-3 sentences coaching the user on their plan — what to focus on, why, and what progress looks like) and a "days" array with one entry per weekday. Example:

{
  "summary": "Your network and goal clarity are your weakest links right now, so week 1 is the warm-up block: light, consistent reps to activate your network and sharpen your target. Week 2 adds load, more volume, more visibility, and starts building the industry awareness that keeps you sharp for the long haul.",
  "days": [
    {
      "day": 1,
      "summary": "Define your target role",
      "tasks": [
        {
          "task": "Write a single sentence that names the exact role, level, and type of company you're training for",
          "why": "You can't build a program without a goal on the whiteboard. Goal clarity is the foundation every other rep gets built on, skip it and every workout after this is just noise",
          "fitness_category": "goal_clarity"
        },
        {
          "task": "Send a short, no-ask message to one former coworker just to reconnect",
          "why": "This is your warm-up set for network strength. Light weight, easy rep, the point is just showing up and getting the muscle firing again before you ask anything of anyone",
          "fitness_category": "network_strength"
        }
      ]
    },
    {
      "day": 2,
      "summary": "Comment on 3 LinkedIn posts",
      "tasks": [
        {
          "task": "Comment on three LinkedIn posts written by people at companies you could see yourself working at, or roles you could see yourself in",
          "why": "Comments are one of the best ways to start a real conversation. There's incentive on both sides, they get visibility on their post, you get a natural reason to reach out, and a good comment often turns into a DM. That's a much warmer opening than a cold connection request",
          "fitness_category": "network_strength"
        },
        {
          "task": "List the 3 things you shipped or drove at work in the last 6 months that you're most proud of",
          "why": "You can't show impact if you can't name it yourself first. This is the film study before game day, get the raw footage down before you edit the highlight reel",
          "fitness_category": "impact_visibility"
        }
      ]
    }
  ]
}

The day summary must be 5 words or fewer — a scannable label for the task (e.g. "Comment on 3 LinkedIn posts", "Write a LinkedIn post draft").

fitness_category must be one of: "goal_clarity", "network_strength", "impact_visibility", "industry_awareness"

TONE

- Direct and motivational.
- Do not use em dashes (—) anywhere in the response.
- Lean heavily into fitness metaphors throughout. Treat each task like an exercise, weeks like training blocks, and the overall plan like a periodized workout program. Reference warm-up sets, working sets, rest days, progressive overload, etc. where natural.
- Every "why" should feel like a trainer explaining why this exercise matters, not a career counselor.
- If somebody is using this tool, they for some reason haven't done this on their own, so they need a push.`;

// Renders one fitness rating as a prompt line, folding in optional "why".
function formatRating(
  survey: Survey,
  category: FitnessCategory,
  label: string,
): string {
  const { score, why } = survey.ratings[category];
  const context = why ? ` — why: ${why}` : "";
  return `- ${label}: ${score}/10${context}`;
}

// Injects the survey answers into the user turn. Structure mirrors the USER
// INPUT section of the system prompt so the model maps fields cleanly.
export function buildRoutinePrompt(survey: Survey): string {
  const additional = survey.additionalContext
    ? `\n\nAdditional context: ${survey.additionalContext}`
    : "";

  return `Here are my career fitness inputs. Build my ten-workday routine.

Career goal: ${survey.careerGoal}
Timeline: ${survey.timeline}
Time available per weekday: ${survey.minutesPerWeekday} minutes
Current career situation: ${survey.currentSituation}

Career fitness ratings (1 weak, 10 strong):
${formatRating(survey, "goal_clarity", "Goal clarity")}
${formatRating(survey, "network_strength", "Network strength")}
${formatRating(survey, "impact_visibility", "Impact visibility")}
${formatRating(survey, "industry_awareness", "Industry awareness")}${additional}

Return only the JSON object described in the OUTPUT FORMAT. No prose before or after it.`;
}

// Extracts the first balanced top-level JSON object from a string, tolerating
// prose or markdown fences the model may wrap around it. Brace counting skips
// braces inside string literals so quoted "{" / "}" never throw it off.
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

export type RoutineParseResult =
  | { data: GeneratedRoutine }
  | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Collapses a day summary to the spec's five-word cap. This is a safe repair
// (a shorter label never corrupts meaning) so a slightly long summary doesn't
// force a full regeneration of an otherwise valid routine.
function clampSummaryWords(summary: string): string {
  const words = summary.trim().split(/\s+/);
  if (words.length <= MAX_DAY_SUMMARY_WORDS) return summary.trim();
  return words.slice(0, MAX_DAY_SUMMARY_WORDS).join(" ");
}

function validateTask(value: unknown, where: string): GeneratedTask | string {
  if (!isRecord(value)) return `${where} is not an object`;
  if (!nonEmptyString(value.task)) return `${where} is missing "task"`;
  if (!nonEmptyString(value.why)) return `${where} is missing "why"`;
  if (
    typeof value.fitness_category !== "string" ||
    !FITNESS_CATEGORY_SET.has(value.fitness_category)
  ) {
    return `${where} has an invalid "fitness_category"`;
  }

  return {
    task: value.task.trim(),
    why: value.why.trim(),
    fitness_category: value.fitness_category as FitnessCategory,
  };
}

function validateDay(
  value: unknown,
  expectedDay: number,
): GeneratedDay | string {
  if (!isRecord(value)) return `Day ${expectedDay} is not an object`;
  if (value.day !== expectedDay) {
    return `Expected day ${expectedDay} but got ${JSON.stringify(value.day)}`;
  }
  if (!nonEmptyString(value.summary)) {
    return `Day ${expectedDay} is missing "summary"`;
  }
  if (!Array.isArray(value.tasks) || value.tasks.length === 0) {
    return `Day ${expectedDay} has no tasks`;
  }

  const tasks: GeneratedTask[] = [];
  for (let i = 0; i < value.tasks.length; i += 1) {
    const task = validateTask(value.tasks[i], `Day ${expectedDay} task ${i + 1}`);
    if (typeof task === "string") return task;
    tasks.push(task);
  }

  return {
    day: expectedDay,
    summary: clampSummaryWords(value.summary),
    tasks,
  };
}

// Strictly validates a parsed value against the spec OUTPUT FORMAT: a summary
// string plus exactly ten days numbered 1..10, each with at least one task and
// a valid fitness_category. Returns a typed error instead of throwing so the
// caller can retry cleanly without ever persisting partial data.
export function validateGeneratedRoutine(value: unknown): RoutineParseResult {
  if (!isRecord(value)) return { error: "Response is not a JSON object" };
  if (!nonEmptyString(value.summary)) {
    return { error: 'Response is missing a "summary"' };
  }
  if (!Array.isArray(value.days)) {
    return { error: 'Response is missing a "days" array' };
  }
  if (value.days.length !== ROUTINE_DAY_COUNT) {
    return {
      error: `Expected ${ROUTINE_DAY_COUNT} days but got ${value.days.length}`,
    };
  }

  const days: GeneratedDay[] = [];
  for (let i = 0; i < ROUTINE_DAY_COUNT; i += 1) {
    const day = validateDay(value.days[i], i + 1);
    if (typeof day === "string") return { error: day };
    days.push(day);
  }

  return { data: { summary: value.summary.trim(), days } };
}

// Full pipeline from raw model text to a validated routine: extract the JSON
// object, parse it, then validate. Any step failing yields a typed error.
export function parseRoutineResponse(text: string): RoutineParseResult {
  const json = extractJsonObject(text);
  if (!json) return { error: "No JSON object found in the model response" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: "Model response was not valid JSON" };
  }

  return validateGeneratedRoutine(parsed);
}

