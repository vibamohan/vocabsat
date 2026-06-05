import { describe, expect, test } from "vitest";

import {
  filterReviewedWords,
  getReviewedWordStatusLabel,
  getVisibleReviewedWords,
  mapReviewedWordRows,
  sortReviewedWords,
  type ReviewedWordRow,
} from "@/lib/study/reviewed-words";
import type { ReviewedWord } from "@/lib/study/types";
import { vocabWord } from "./factories";

function reviewedWord(overrides: Partial<ReviewedWord> = {}): ReviewedWord {
  const word = overrides.vocab_word ?? vocabWord({ id: overrides.vocab_word_id });

  return {
    correct_count: 1,
    guessed_count: 0,
    last_ready_at: null,
    last_seen_at: "2026-05-20T12:00:00.000Z",
    miss_count: 0,
    next_review_on: "2026-05-21",
    review_interval_days: 1,
    status: "learning",
    vocab_word: word,
    vocab_word_id: word.id,
    ...overrides,
  };
}

function reviewedWordRow(
  overrides: Partial<ReviewedWordRow> = {},
): ReviewedWordRow {
  const overrideWord = overrides.vocab_word;
  const word = Array.isArray(overrideWord)
    ? overrideWord[0] ?? vocabWord({ id: overrides.vocab_word_id })
    : overrideWord ?? vocabWord({ id: overrides.vocab_word_id });

  return {
    correct_count: 1,
    guessed_count: 0,
    last_ready_at: null,
    last_seen_at: "2026-05-20T12:00:00.000Z",
    miss_count: 0,
    next_review_on: "2026-05-21",
    review_interval_days: 1,
    status: "learning",
    vocab_word: word,
    vocab_word_id: word.id,
    ...overrides,
  };
}

describe("reviewed word helpers", () => {
  test("maps only rows with a seen date and vocabulary word", () => {
    const rows = [
      reviewedWordRow({ vocab_word_id: 1 }),
      reviewedWordRow({ last_seen_at: null, vocab_word_id: 2 }),
      reviewedWordRow({ vocab_word: null, vocab_word_id: 3 }),
    ];

    expect(mapReviewedWordRows(rows).map((word) => word.vocab_word_id)).toEqual([
      1,
    ]);
  });

  test("maps Supabase relation arrays to the joined vocabulary word", () => {
    const joinedWord = vocabWord({ id: 4, word: "abstruse" });

    expect(
      mapReviewedWordRows([
        reviewedWordRow({ vocab_word: [joinedWord], vocab_word_id: 4 }),
      ]),
    ).toEqual([
      expect.objectContaining({
        vocab_word: joinedWord,
        vocab_word_id: 4,
      }),
    ]);
  });

  test("filters by status and search text", () => {
    const words = [
      reviewedWord({
        status: "weak",
        vocab_word: vocabWord({ fast_meaning: "careless routine", id: 1, word: "perfunctory" }),
      }),
      reviewedWord({
        status: "known",
        vocab_word: vocabWord({ fast_meaning: "harmful", id: 2, word: "inimical" }),
      }),
    ];

    expect(
      filterReviewedWords(words, { query: "routine", status: "weak" }).map(
        (word) => word.vocab_word.word,
      ),
    ).toEqual(["perfunctory"]);
  });

  test("sorts by most recent seen date by default", () => {
    const words = [
      reviewedWord({
        last_seen_at: "2026-05-18T12:00:00.000Z",
        vocab_word: vocabWord({ id: 1, word: "older" }),
      }),
      reviewedWord({
        last_seen_at: "2026-05-20T12:00:00.000Z",
        vocab_word: vocabWord({ id: 2, word: "newer" }),
      }),
    ];

    expect(sortReviewedWords(words, "last_seen").map((word) => word.vocab_word.word)).toEqual([
      "newer",
      "older",
    ]);
  });

  test("sorts by most missed with guessed and last seen tie-breakers", () => {
    const words = [
      reviewedWord({
        guessed_count: 3,
        last_seen_at: "2026-05-18T12:00:00.000Z",
        miss_count: 1,
        vocab_word: vocabWord({ id: 1, word: "guessed" }),
      }),
      reviewedWord({
        guessed_count: 0,
        last_seen_at: "2026-05-20T12:00:00.000Z",
        miss_count: 3,
        vocab_word: vocabWord({ id: 2, word: "missed" }),
      }),
      reviewedWord({
        guessed_count: 1,
        last_seen_at: "2026-05-21T12:00:00.000Z",
        miss_count: 1,
        vocab_word: vocabWord({ id: 3, word: "tie" }),
      }),
    ];

    expect(
      sortReviewedWords(words, "most_missed").map(
        (word) => word.vocab_word.word,
      ),
    ).toEqual(["missed", "guessed", "tie"]);
  });

  test("combines filtering and sorting for visible words", () => {
    const words = [
      reviewedWord({
        last_seen_at: "2026-05-20T12:00:00.000Z",
        status: "weak",
        vocab_word: vocabWord({ id: 1, word: "zealous" }),
      }),
      reviewedWord({
        last_seen_at: "2026-05-21T12:00:00.000Z",
        status: "weak",
        vocab_word: vocabWord({ id: 2, word: "abate" }),
      }),
    ];

    expect(
      getVisibleReviewedWords({
        query: "",
        sort: "word",
        status: "weak",
        words,
      }).map((word) => word.vocab_word.word),
    ).toEqual(["abate", "zealous"]);
  });

  test("formats recall-ready status labels", () => {
    expect(getReviewedWordStatusLabel("recall_ready")).toBe("Recall-ready");
  });
});
