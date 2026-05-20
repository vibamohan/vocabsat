import { describe, expect, test } from "vitest";

import {
  buildNextForeverReviewQuestion,
  buildNextQuestion,
  getQuestionTypeLabel,
  getReadyCount,
  getSatisfiedTypes,
  isRecallReady,
} from "@/lib/study/questions";
import type { LatestAttempt } from "@/lib/study/types";
import { satisfiedWord, sessionWord, studySession, vocabWord } from "./factories";

describe("question helpers", () => {
  test("returns the display label for a question type", () => {
    expect(getQuestionTypeLabel("sat_usage")).toBe("SAT-style usage");
  });

  test("counts recall-ready words", () => {
    expect(getReadyCount([sessionWord(), satisfiedWord({ id: "ready" })])).toBe(
      1,
    );
  });

  test("returns satisfied question types", () => {
    expect(
      getSatisfiedTypes(
        sessionWord({
          satisfied_meaning_recognition: true,
          satisfied_sat_usage: true,
        }),
      ),
    ).toEqual(["meaning_recognition", "sat_usage"]);
  });

  test("requires all question types for recall readiness", () => {
    expect(
      isRecallReady(
        sessionWord({
          satisfied_meaning_recognition: true,
          satisfied_reverse_recall: true,
        }),
      ),
    ).toBe(false);
  });
});

describe("daily question building", () => {
  test("returns no question when every word is recall-ready", () => {
    expect(
      buildNextQuestion(studySession(), [satisfiedWord()], null),
    ).toBeNull();
  });

  test("starts a new word with meaning recognition", () => {
    const word = sessionWord({
      word: { fast_meaning: "brief and clear", word: "concise" },
    });

    const question = buildNextQuestion(studySession(), [word], null);

    expect(question).toMatchObject({
      helperText: "Choose the meaning.",
      prompt: "Concise most nearly means:",
      questionType: "meaning_recognition",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    expect(question?.options).toContainEqual({
      label: "brief and clear",
      vocabWordId: word.vocab_word_id,
    });
  });

  test("uses word labels for reverse recall options", () => {
    const word = sessionWord({
      satisfied_meaning_recognition: true,
      word: { fast_meaning: "quietly skilled", word: "adept" },
    });

    const question = buildNextQuestion(studySession(), [word], null);

    expect(question?.questionType).toBe("reverse_recall");
    expect(question?.prompt).toBe('Which word means "quietly skilled"?');
    expect(question?.options).toContainEqual({
      label: "adept",
      vocabWordId: word.vocab_word_id,
    });
  });

  test("blanks the target word in SAT usage prompts", () => {
    const word = sessionWord({
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      word: {
        example_sentence: "The terse reply ended the debate.",
        fast_meaning: "brief",
        word: "terse",
      },
    });

    const question = buildNextQuestion(studySession(), [word], null);

    expect(question?.questionType).toBe("sat_usage");
    expect(question?.prompt).toBe("The ______ reply ended the debate.");
  });

  test("uses a fallback SAT usage prompt when the example cannot be blanked", () => {
    const word = sessionWord({
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      word: {
        example_sentence: "The reply ended the debate.",
        fast_meaning: "brief",
        word: "terse",
      },
    });

    const question = buildNextQuestion(studySession(), [word], null);

    expect(question?.prompt).toBe(
      'The sentence calls for a word meaning "brief": ______.',
    );
  });

  test("prioritizes shaky words over new words", () => {
    const newWord = sessionWord({
      id: "new-word",
      position: 0,
      vocab_word_id: 1,
      word: { id: 1 },
    });
    const shakyWord = sessionWord({
      id: "shaky-word",
      miss_count: 1,
      position: 1,
      status: "shaky",
      vocab_word_id: 2,
      word: { id: 2 },
    });

    const question = buildNextQuestion(
      studySession(),
      [newWord, shakyWord],
      null,
    );

    expect(question?.targetSessionWordId).toBe("shaky-word");
  });

  test("avoids repeating the latest word when another candidate is available", () => {
    const latestAttempt: LatestAttempt = {
      created_at: "2026-05-20T12:05:00.000Z",
      question_type: "meaning_recognition",
      session_word_id: "first-word",
    };
    const firstWord = sessionWord({
      id: "first-word",
      position: 0,
      vocab_word_id: 1,
      word: { id: 1 },
    });
    const secondWord = sessionWord({
      id: "second-word",
      position: 1,
      vocab_word_id: 2,
      word: { id: 2 },
    });

    const question = buildNextQuestion(
      studySession(),
      [firstWord, secondWord],
      latestAttempt,
    );

    expect(question?.targetSessionWordId).toBe("second-word");
  });

  test("fills options with unique distractors", () => {
    const target = sessionWord({
      vocab_word_id: 1,
      word: { fast_meaning: "target meaning", id: 1, word: "target" },
    });
    const duplicateTarget = vocabWord({
      fast_meaning: "duplicate meaning",
      id: 1,
      word: "duplicate-target",
    });
    const options = [
      duplicateTarget,
      vocabWord({ id: 2, word: "second" }),
      vocabWord({ id: 3, word: "third" }),
      vocabWord({ id: 4, word: "fourth" }),
      vocabWord({ id: 5, word: "fifth" }),
    ];

    const question = buildNextQuestion(studySession(), [target], null, options);
    const optionIds = question?.options.map((option) => option.vocabWordId);

    expect(optionIds).toContain(1);
    expect(new Set(optionIds).size).toBe(optionIds?.length);
    expect(question?.options).toHaveLength(4);
  });
});

describe("forever review question building", () => {
  test("returns no question when there are no review words", () => {
    expect(
      buildNextForeverReviewQuestion(studySession(), [], null),
    ).toBeNull();
  });

  test("keeps recall-ready words eligible", () => {
    const word = satisfiedWord();

    const question = buildNextForeverReviewQuestion(
      studySession({ session_type: "forever_review" }),
      [word],
      null,
    );

    expect(question?.targetSessionWordId).toBe(word.id);
  });

  test("prioritizes weak review words", () => {
    const readyWord = satisfiedWord({
      id: "ready-word",
      position: 0,
      vocab_word_id: 1,
      word: { id: 1 },
    });
    const weakWord = sessionWord({
      id: "weak-word",
      miss_count: 1,
      position: 1,
      source: "review",
      status: "shaky",
      vocab_word_id: 2,
      word: { id: 2 },
    });

    const question = buildNextForeverReviewQuestion(
      studySession({ session_type: "forever_review" }),
      [readyWord, weakWord],
      null,
    );

    expect(question?.targetSessionWordId).toBe("weak-word");
  });
});
