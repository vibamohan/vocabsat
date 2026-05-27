import { describe, expect, test } from "vitest";

import {
  buildForeverReviewWordSelection,
  buildDailyWordSelection,
  excludeKnownVocabWords,
  getSeenVocabWordIds,
  getMissingForeverReviewSelections,
  getUnseenWordsByUserOrder,
  isReviewableMasteryRow,
  type DailySelectionMasteryRow,
  type SelectedSessionWord,
} from "@/lib/study/client-session";
import { vocabWord } from "./factories";

function selectedWord(id: number): SelectedSessionWord {
  return {
    masteryStatus: "recall_ready",
    source: "review",
    word: vocabWord({ id }),
  };
}

function masteryRow(
  overrides: Partial<DailySelectionMasteryRow> & { vocab_word_id: number },
): DailySelectionMasteryRow {
  return {
    correct_count: 0,
    guessed_count: 0,
    last_ready_at: null,
    last_seen_at: "2026-04-20T12:00:00.000Z",
    miss_count: 0,
    next_review_on: "2026-05-20",
    review_interval_days: 1,
    status: "recall_ready",
    user_id: "user-1",
    ...overrides,
  };
}

describe("forever review session helpers", () => {
  test("returns only selected review words missing from the existing session", () => {
    const missingSelections = getMissingForeverReviewSelections(
      [{ vocab_word_id: 1 }, { vocab_word_id: 3 }],
      [selectedWord(1), selectedWord(2), selectedWord(3), selectedWord(4)],
    );

    expect(missingSelections.map((entry) => entry.word.id)).toEqual([2, 4]);
  });
});

describe("daily word selection helpers", () => {
  test("treats mastery rows and prior session words as already seen", () => {
    const seenWordIds = getSeenVocabWordIds(
      [{ vocab_word_id: 1 }],
      [{ vocab_word_id: 2 }, { vocab_word_id: 3 }],
    );

    expect([...seenWordIds].sort()).toEqual([1, 2, 3]);
  });

  test("returns only words that are neither seen nor already selected", () => {
    const words = [1, 2, 3, 4].map((id) => vocabWord({ id }));
    const unseenWords = getUnseenWordsByUserOrder(
      words,
      new Set([1, 2]),
      new Set([3]),
    );

    expect(unseenWords.map((word) => word.id)).toEqual([4]);
  });

  test("excludes known words from question option pools", () => {
    const words = [1, 2, 3].map((id) => vocabWord({ id }));
    const optionWords = excludeKnownVocabWords(words, [
      masteryRow({ status: "known", vocab_word_id: 1 }),
      masteryRow({ status: "weak", vocab_word_id: 2 }),
    ]);

    expect(optionWords.map((word) => word.id)).toEqual([2, 3]);
  });

  test("supports review selections as exclusions before filling new words", () => {
    const words = [1, 2, 3, 4].map((id) => vocabWord({ id }));
    const selectedReviewWords = new Map<number, SelectedSessionWord>([
      [4, selectedWord(4)],
    ]);
    const unseenWords = getUnseenWordsByUserOrder(
      words,
      new Set([1]),
      selectedReviewWords,
    );

    expect(unseenWords.map((word) => word.id)).toEqual([2, 3]);
  });

  test("selects six new and six review words for daily sessions", () => {
    const words = Array.from({ length: 18 }, (_, index) =>
      vocabWord({ id: index + 1 }),
    );
    const masteryRows = Array.from({ length: 8 }, (_, index) =>
      masteryRow({ vocab_word_id: index + 1 }),
    );

    const selectedWords = buildDailyWordSelection({
      masteryRows,
      seenSessionWordRows: [],
      studyDate: "2026-05-20",
      userId: "user-1",
      words,
    });

    expect(selectedWords).toHaveLength(12);
    expect(selectedWords.filter((entry) => entry.source === "new")).toHaveLength(
      6,
    );
    expect(
      selectedWords.filter((entry) => entry.source === "review"),
    ).toHaveLength(6);
  });

  test("orders daily selections as two chunks of three new and three review words", () => {
    const words = Array.from({ length: 18 }, (_, index) =>
      vocabWord({ id: index + 1 }),
    );
    const masteryRows = Array.from({ length: 6 }, (_, index) =>
      masteryRow({ vocab_word_id: index + 1 }),
    );

    const selectedWords = buildDailyWordSelection({
      masteryRows,
      seenSessionWordRows: [],
      studyDate: "2026-05-20",
      userId: "user-1",
      words,
    });

    expect(selectedWords.map((entry) => entry.source)).toEqual([
      "new",
      "new",
      "new",
      "review",
      "review",
      "review",
      "new",
      "new",
      "new",
      "review",
      "review",
      "review",
    ]);
  });

  test("uses available daily pools without exceeding twelve words", () => {
    const words = Array.from({ length: 10 }, (_, index) =>
      vocabWord({ id: index + 1 }),
    );
    const masteryRows = [masteryRow({ vocab_word_id: 1 })];

    const selectedWords = buildDailyWordSelection({
      masteryRows,
      seenSessionWordRows: [],
      studyDate: "2026-05-20",
      userId: "user-1",
      words,
    });

    expect(selectedWords).toHaveLength(7);
    expect(selectedWords.filter((entry) => entry.source === "new")).toHaveLength(
      6,
    );
    expect(
      selectedWords.filter((entry) => entry.source === "review"),
    ).toHaveLength(1);
  });

  test("excludes known rows from daily review while keeping them seen", () => {
    const words = Array.from({ length: 12 }, (_, index) =>
      vocabWord({ id: index + 1 }),
    );
    const selectedWords = buildDailyWordSelection({
      masteryRows: [
        masteryRow({ status: "known", vocab_word_id: 1 }),
        masteryRow({ status: "recall_ready", vocab_word_id: 2 }),
      ],
      seenSessionWordRows: [],
      studyDate: "2026-05-20",
      userId: "user-1",
      words,
    });

    expect(selectedWords.map((entry) => entry.word.id)).not.toContain(1);
    expect(
      selectedWords.filter((entry) => entry.source === "review").map(
        (entry) => entry.word.id,
      ),
    ).toEqual([2]);
  });

  test("identifies known mastery rows as not reviewable", () => {
    expect(isReviewableMasteryRow(masteryRow({ vocab_word_id: 1 }))).toBe(true);
    expect(
      isReviewableMasteryRow(
        masteryRow({ status: "known", vocab_word_id: 1 }),
      ),
    ).toBe(false);
  });
});

describe("forever review word selection helpers", () => {
  test("excludes known rows from forever review selections", () => {
    const words = [1, 2, 3].map((id) => vocabWord({ id }));
    const selectedWords = buildForeverReviewWordSelection({
      masteryRows: [
        masteryRow({ status: "known", vocab_word_id: 1 }),
        masteryRow({ status: "weak", vocab_word_id: 2 }),
        masteryRow({ status: "recall_ready", vocab_word_id: 3 }),
      ],
      studyDate: "2026-05-20",
      userId: "user-1",
      words,
    });

    expect(selectedWords.map((entry) => entry.word.id)).not.toContain(1);
    expect(selectedWords).toHaveLength(2);
    expect(selectedWords.every((entry) => entry.source === "review")).toBe(true);
  });
});
