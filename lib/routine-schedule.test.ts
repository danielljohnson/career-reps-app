import { describe, expect, it } from "vitest";

import { getRoutineSchedule } from "@/lib/routine-schedule";

// Creation timestamps and "now" are expressed as UTC noon to keep the math
// unambiguous regardless of local timezone.
const TUESDAY = "2026-08-04T12:00:00Z";
const FRIDAY = "2026-08-07T12:00:00Z";

describe("getRoutineSchedule", () => {
  it("shows day 1 on the day the routine was created", () => {
    const schedule = getRoutineSchedule(TUESDAY, 10, new Date(TUESDAY));
    expect(schedule).toEqual({ currentDayNumber: 1, isComplete: false });
  });

  it("advances by one for each elapsed weekday", () => {
    const wednesday = new Date("2026-08-05T12:00:00Z");
    const schedule = getRoutineSchedule(TUESDAY, 10, wednesday);
    expect(schedule.currentDayNumber).toBe(2);
  });

  it("does not advance the day number over a weekend", () => {
    // Friday -> Monday is one weekday elapsed, not three calendar days.
    const monday = new Date("2026-08-10T12:00:00Z");
    const schedule = getRoutineSchedule(FRIDAY, 10, monday);
    expect(schedule.currentDayNumber).toBe(2);
  });

  it("clamps to the last day and flags completion once the block is finished", () => {
    // 14 calendar days after a Tuesday is a Tuesday two weeks later: exactly
    // 10 weekdays have elapsed, one past the last (day 10) rep.
    const twoWeeksLater = new Date("2026-08-18T12:00:00Z");
    const schedule = getRoutineSchedule(TUESDAY, 10, twoWeeksLater);
    expect(schedule).toEqual({ currentDayNumber: 10, isComplete: true });
  });

  it("never returns a day before 1, even for a now before creation", () => {
    const yesterday = new Date("2026-08-03T12:00:00Z");
    const schedule = getRoutineSchedule(TUESDAY, 10, yesterday);
    expect(schedule).toEqual({ currentDayNumber: 1, isComplete: false });
  });
});

