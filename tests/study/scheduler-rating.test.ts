import { describe, expect, test } from "vitest";

import { getSchedulerRating } from "@/lib/study/scheduler-rating";

describe("getSchedulerRating", () => {
  test.each([
    ["incorrect", 1],
    ["unsure", 2],
    ["correct", 3],
    ["already_known", 4],
  ] as const)("maps %s to rating %s", (outcome, rating) => {
    expect(getSchedulerRating(outcome)).toBe(rating);
  });
});
