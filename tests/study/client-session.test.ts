import { describe, expect, test } from "vitest";

import {
  getMissingForeverReviewSelections,
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
