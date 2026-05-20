import { describe, expect, test } from "vitest";

import { getStudyProgress } from "@/lib/study/progress";
import { satisfiedWord, sessionWord } from "./factories";

describe("study progress", () => {
  test("returns zero progress when there are no words", () => {
    expect(getStudyProgress([])).toEqual({
      completedUnits: 0,
      percent: 0,
      totalUnits: 0,
      totalWords: 0,
      wordProgress: [],
    });
  });

  test("counts satisfied question types for active words", () => {
    const progress = getStudyProgress([
      sessionWord({
        id: "word-1",
        satisfied_meaning_recognition: true,
        satisfied_reverse_recall: true,
      }),
    ]);

    expect(progress.completedUnits).toBe(2);
    expect(progress.percent).toBe(67);
    expect(progress.wordProgress[0]).toMatchObject({
      completedUnits: 2,
      id: "word-1",
      percent: 67,
      totalUnits: 3,
    });
  });

  test("treats recall-ready words as complete", () => {
    const progress = getStudyProgress([
      satisfiedWord({
        id: "word-1",
        satisfied_sat_usage: false,
      }),
    ]);

    expect(progress.completedUnits).toBe(3);
    expect(progress.percent).toBe(100);
  });

  test("aggregates progress across words", () => {
    const progress = getStudyProgress([
      sessionWord({
        id: "word-1",
        satisfied_meaning_recognition: true,
      }),
      satisfiedWord({ id: "word-2", vocab_word_id: 2, word: { id: 2 } }),
    ]);

    expect(progress.completedUnits).toBe(4);
    expect(progress.totalUnits).toBe(6);
    expect(progress.percent).toBe(67);
    expect(progress.totalWords).toBe(2);
  });
});
