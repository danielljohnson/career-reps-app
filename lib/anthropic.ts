import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { buildRoutinePrompt, parseRoutineResponse, SYSTEM_PROMPT } from "@/lib/routines";
import type { GeneratedRoutine, Survey } from "@/lib/types";

// Default model for routine generation. Override with ANTHROPIC_MODEL if a
// different Claude model is preferred without a code change.
const DEFAULT_MODEL = "claude-sonnet-5";

// The routine JSON (10 days, multiple tasks each with a 2-3 sentence "why")
// runs long; observed output is ~1750 tokens, so 4000 leaves generous headroom
// without giving the model enough room to ramble past the serverless budget.
const MAX_TOKENS = 4000;

// Production runs on the Vercel Free/Hobby plan, which hard-caps function
// execution at 60s. A single generation takes ~37s, so one attempt fits with
// margin, but two attempts (~74s+) cannot. Parsing is fence-tolerant (see
// parseRoutineResponse), which removes the main reason a retry was ever
// needed, so we spend the whole budget on one solid attempt instead of
// reserving time for a retry that would blow the deadline anyway.
const MAX_ATTEMPTS = 1;

// Per-request timeout, sized so the single attempt fits inside the dashboard
// route's maxDuration budget: MAX_ATTEMPTS * REQUEST_TIMEOUT_MS = 50s, leaving
// ~10s of headroom for function overhead before the route's 60s maxDuration
// (itself the Vercel Free plan's hard cap). Without this cap a hung request
// rides the SDK's 10-minute default and kills the function mid-persist. Keep
// this in lockstep with maxDuration in the route.
const REQUEST_TIMEOUT_MS = 50_000;

// Thrown when generation fails. The message is safe to surface to the user;
// the cause carries detail for server logs.
export class RoutineGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RoutineGenerationError";
  }
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new RoutineGenerationError(
      "Routine generation is not configured. Set ANTHROPIC_API_KEY.",
    );
  }
  return key;
}

// Concatenates the text blocks of a Messages response into a single string.
function extractText(message: Anthropic.Message): string {
  return message.content
    .filter(
      (block): block is Anthropic.TextBlock => block.type === "text",
    )
    .map((block) => block.text)
    .join("");
}

// Calls the Anthropic Messages API with the spec's coaching prompt and the
// user's survey, then strictly validates the JSON. A single attempt is all
// the 60s Free-plan budget allows; parseRoutineResponse tolerates markdown
// fences so that attempt reliably succeeds. Throws RoutineGenerationError on
// API failure or an unusable response; the caller persists nothing unless a
// fully valid routine is returned.
export async function generateRoutine(
  survey: Survey,
): Promise<GeneratedRoutine> {
  // Per-request timeout keeps a hung request from riding the SDK's 10-minute
  // default; sized so the single attempt fits the route's maxDuration.
  const client = new Anthropic({
    apiKey: getApiKey(),
    timeout: REQUEST_TIMEOUT_MS,
  });
  const userPrompt = buildRoutinePrompt(survey);

  let lastError = "Unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (cause) {
      // API/network/auth failures are not recoverable by retrying the same
      // request, so surface immediately without corrupting any state.
      throw new RoutineGenerationError(
        "Could not reach the coaching model. Please try again.",
        { cause },
      );
    }

    const result = parseRoutineResponse(extractText(message));
    if ("data" in result) {
      return result.data;
    }

    lastError = result.error;
  }

  throw new RoutineGenerationError(
    `The coaching model returned an unusable routine (${lastError}).`,
  );
}

