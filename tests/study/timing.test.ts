import { describe, expect, test } from "vitest";

import { createQuestionTimer } from "@/lib/study/timing";

describe("createQuestionTimer", () => {
  test("measures active time and excludes pauses", () => {
    let monotonicTime = 100;
    let wallTime = Date.parse("2026-08-21T12:00:00.000Z");
    const timer = createQuestionTimer({
      monotonicNow: () => monotonicTime,
      wallNow: () => new Date(wallTime),
    });

    monotonicTime = 350;
    timer.pause();
    monotonicTime = 2_000;
    timer.resume();
    monotonicTime = 2_500;
    wallTime += 2_400;

    expect(timer.finish()).toEqual({
      answeredAt: "2026-08-21T12:00:02.400Z",
      responseTimeMs: 750,
      shownAt: "2026-08-21T12:00:00.000Z",
    });
  });

  test("returns the same result when finished more than once", () => {
    let time = 0;
    const timer = createQuestionTimer({
      monotonicNow: () => time,
      wallNow: () => new Date("2026-08-21T12:00:00.000Z"),
    });

    time = 125;
    const first = timer.finish();
    time = 500;

    expect(timer.finish()).toBe(first);
    expect(first.responseTimeMs).toBe(125);
  });
});
