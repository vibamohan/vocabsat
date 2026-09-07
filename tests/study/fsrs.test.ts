import { describe, expect, test } from "vitest";

import { scheduleFsrsReview, toFsrsCard } from "@/lib/study/fsrs";

const reviewedAt = new Date("2026-08-22T12:00:00.000Z");

describe("FSRS scheduling", () => {
  test("schedules a new successful card with 90 percent retention", () => {
    const update = scheduleFsrsReview(null, 3, reviewedAt);

    expect(update.fsrs_due).toBe("2026-08-25T12:00:00.000Z");
    expect(update.fsrs_reps).toBe(1);
    expect(update.review_interval_days).toBe(3);
  });

  test("conservatively converts legacy mastery into a review card", () => {
    const card = toFsrsCard(
      {
        correct_count: 4,
        guessed_count: 1,
        last_seen_at: "2026-08-15T12:00:00.000Z",
        miss_count: 1,
        next_review_on: "2026-08-22",
        review_interval_days: 7,
      },
      reviewedAt,
    );

    expect(card.due.toISOString()).toBe("2026-08-22T00:00:00.000Z");
    expect(card.stability).toBe(7);
    expect(card.lapses).toBe(1);
  });

  test("a lapse schedules earlier than a confident answer", () => {
    const again = scheduleFsrsReview(null, 1, reviewedAt);
    const good = scheduleFsrsReview(null, 3, reviewedAt);

    expect(Date.parse(again.fsrs_due)).toBeLessThan(Date.parse(good.fsrs_due));
  });
});
