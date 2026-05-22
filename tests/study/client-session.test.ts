import { describe, expect, test } from "vitest";

import {
  getSeenVocabWordIds,
  getMissingForeverReviewSelections,
  getUnseenWordsByUserOrder,
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
});
