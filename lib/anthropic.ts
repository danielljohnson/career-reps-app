import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { buildRoutinePrompt, parseRoutineResponse, SYSTEM_PROMPT } from "@/lib/routines";
import type { GeneratedRoutine, Survey } from "@/lib/types";

// Default model for routine generation. Override with ANTHROPIC_MODEL if a
// different Claude model is preferred without a code change.
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

// The routine JSON (10 days, multiple tasks each with a 2-3 sentence "why")
// runs long, so give the model room to finish without truncating the JSON.
const MAX_TOKENS = 8000;

// Two shots at a well-formed routine: a single retry absorbs the occasional
// run where the model wraps prose around the JSON or drops a field, without
// hammering the API on a persistent failure.
const MAX_ATTEMPTS = 2;

// Thrown when generation fails after retries. The message is safe to surface
// to the user; the cause carries detail for server logs.
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
// user's survey, then strictly validates the JSON. Retries once on a malformed
// response. Throws RoutineGenerationError on API failure or exhausted retries;
// the caller persists nothing unless a fully valid routine is returned.
export async function generateRoutine(
  survey: Survey,
): Promise<GeneratedRoutine> {
  // Bound the call well under the route's maxDuration so a hung request fails
  // fast and surfaces a retryable error, rather than riding the SDK's 10-minute
  // default while the user stares at a disabled button.
  const client = new Anthropic({ apiKey: getApiKey(), timeout: 90_000 });
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

