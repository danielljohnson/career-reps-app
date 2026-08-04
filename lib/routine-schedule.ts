// Determines which routine day the dashboard shows as "today". Kept
// framework-free (no Next.js / Supabase imports) so the date math is a plain
// pure function, unit-testable in isolation from data loading and rendering.
//
// For MVP the routine is a fixed 10-workday block: it does not adapt to
// completed or skipped tasks (that's a future feature per the spec). So
// "today" is simply the routine's day 1 on the day it was created, advancing
// by one for every weekday that has since elapsed. Weekends don't advance the
// count, matching the routine's weekday-only cadence. Once more weekdays have
// elapsed than the routine has days, the block is finished: the day number
// clamps to the last day so the dashboard never asks for a day that doesn't
// exist, and isComplete flags that state for the UI.

export interface RoutineSchedule {
  currentDayNumber: number;
  isComplete: boolean;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

// Counts weekdays strictly between two dates: from's calendar day (exclusive)
// up to to's calendar day (inclusive). Same-day or to-before-from returns 0.
function countElapsedWeekdays(from: Date, to: Date): number {
  const cursor = startOfUtcDay(from);
  const end = startOfUtcDay(to);

  let count = 0;
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

export function getRoutineSchedule(
  createdAt: string,
  totalDays: number,
  now: Date = new Date(),
): RoutineSchedule {
  const elapsedWeekdays = countElapsedWeekdays(new Date(createdAt), now);

  return {
    currentDayNumber: Math.min(elapsedWeekdays + 1, totalDays),
    isComplete: elapsedWeekdays >= totalDays,
  };
}

