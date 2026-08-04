import { describe, expect, it } from "vitest";

import {
  buildRoutinePrompt,
  extractJsonObject,
  parseRoutineResponse,
  ROUTINE_DAY_COUNT,
  validateGeneratedRoutine,
} from "@/lib/routines";
import type { GeneratedRoutine, Survey } from "@/lib/types";

// A minimal, well-formed routine with the exact ten days the spec requires.
// Tests mutate a structuredClone of this to exercise individual failure paths.
function validRoutine(): GeneratedRoutine {
  return {
    summary: "Warm up your network and sharpen your target this block.",
    days: Array.from({ length: ROUTINE_DAY_COUNT }, (_, i) => ({
      day: i + 1,
      summary: "Comment on 3 LinkedIn posts",
      tasks: [
        {
          task: "Comment on three posts from target companies",
          why: "Comments open real conversations. Warm-up set for network strength.",
          fitness_category: "network_strength" as const,
        },
      ],
    })),
  };
}

function survey(overrides: Partial<Survey> = {}): Survey {
  return {
    id: "survey-1",
    userId: "user-1",
    createdAt: "2026-08-04T00:00:00Z",
    careerGoal: "Staff engineer at a mid-size fintech",
    timeline: "3 months",
    minutesPerWeekday: 45,
    currentSituation: "employed and searching quietly",
    additionalContext: null,
    ratings: {
      goal_clarity: { score: 4, why: "Unsure between IC and management" },
      network_strength: { score: 3, why: null },
      impact_visibility: { score: 6, why: null },
      industry_awareness: { score: 7, why: null },
    },
    ...overrides,
  };
}

describe("extractJsonObject", () => {
  it("returns a bare JSON object unchanged", () => {
    const json = '{"summary":"x","days":[]}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it("pulls the object out of surrounding prose", () => {
    const text = 'Here is your plan:\n{"summary":"x"}\nGood luck!';
    expect(extractJsonObject(text)).toBe('{"summary":"x"}');
  });

  it("pulls the object out of a markdown fence", () => {
    const text = '```json\n{"summary":"x"}\n```';
    expect(extractJsonObject(text)).toBe('{"summary":"x"}');
  });

  it("ignores braces inside string literals", () => {
    const json = '{"task":"use a { literal brace } here"}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it("ignores escaped quotes inside string literals", () => {
    const json = '{"why":"she said \\"ship it\\" then left"}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it("returns null when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });

  it("returns null for an unbalanced object", () => {
    expect(extractJsonObject('{"summary":"x"')).toBeNull();
  });
});

describe("validateGeneratedRoutine", () => {
  it("accepts a well-formed ten-day routine and trims strings", () => {
    const input = validRoutine();
    input.summary = "  spacey summary  ";
    input.days[0].tasks[0].task = "  padded task  ";
    const result = validateGeneratedRoutine(input);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.summary).toBe("spacey summary");
      expect(result.data.days).toHaveLength(ROUTINE_DAY_COUNT);
      expect(result.data.days[0].tasks[0].task).toBe("padded task");
    }
  });

  it("rejects a non-object", () => {
    expect(validateGeneratedRoutine(42)).toEqual({
      error: "Response is not a JSON object",
    });
  });

  it("rejects a missing summary", () => {
    const input = validRoutine() as unknown as Record<string, unknown>;
    delete input.summary;
    expect("error" in validateGeneratedRoutine(input)).toBe(true);
  });

  it("rejects a missing days array", () => {
    const input = validRoutine() as unknown as Record<string, unknown>;
    delete input.days;
    expect("error" in validateGeneratedRoutine(input)).toBe(true);
  });

  it("rejects the wrong day count", () => {
    const input = validRoutine();
    input.days = input.days.slice(0, 9);
    expect(validateGeneratedRoutine(input)).toEqual({
      error: "Expected 10 days but got 9",
    });
  });

  it("rejects out-of-order day numbers", () => {
    const input = validRoutine();
    input.days[3].day = 99;
    expect("error" in validateGeneratedRoutine(input)).toBe(true);
  });

  it("rejects a day with no tasks", () => {
    const input = validRoutine();
    input.days[0].tasks = [];
    expect(validateGeneratedRoutine(input)).toEqual({
      error: "Day 1 has no tasks",
    });
  });

  it("rejects a task missing its why", () => {
    const input = validRoutine() as unknown as {
      days: { tasks: Record<string, unknown>[] }[];
    };
    delete input.days[0].tasks[0].why;
    expect("error" in validateGeneratedRoutine(input)).toBe(true);
  });

  it("rejects an invalid fitness_category", () => {
    const input = validRoutine();
    input.days[0].tasks[0].fitness_category =
      "vibes" as unknown as GeneratedRoutine["days"][0]["tasks"][0]["fitness_category"];
    expect(validateGeneratedRoutine(input)).toEqual({
      error: 'Day 1 task 1 has an invalid "fitness_category"',
    });
  });

  it("clamps an over-long day summary to five words", () => {
    const input = validRoutine();
    input.days[0].summary = "one two three four five six seven";
    const result = validateGeneratedRoutine(input);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.days[0].summary).toBe("one two three four five");
    }
  });
});

describe("parseRoutineResponse", () => {
  it("parses a valid routine wrapped in prose", () => {
    const text = `Here's your program:\n${JSON.stringify(validRoutine())}\nGo get it.`;
    const result = parseRoutineResponse(text);
    expect("data" in result).toBe(true);
  });

  it("errors when no JSON object is present", () => {
    expect(parseRoutineResponse("sorry, no plan today")).toEqual({
      error: "No JSON object found in the model response",
    });
  });

  it("errors on malformed JSON", () => {
    expect(parseRoutineResponse('{"summary": "x", days: }')).toEqual({
      error: "Model response was not valid JSON",
    });
  });
});

describe("buildRoutinePrompt", () => {
  it("includes the goal, ratings, and situation", () => {
    const prompt = buildRoutinePrompt(survey());
    expect(prompt).toContain("Staff engineer at a mid-size fintech");
    expect(prompt).toContain("Goal clarity: 4/10");
    expect(prompt).toContain("why: Unsure between IC and management");
    expect(prompt).toContain("employed and searching quietly");
  });

  it("omits additional context when absent and includes it when present", () => {
    expect(buildRoutinePrompt(survey())).not.toContain("Additional context:");
    expect(
      buildRoutinePrompt(survey({ additionalContext: "Relocating to Berlin" })),
    ).toContain("Additional context: Relocating to Berlin");
  });
});

