import { describe, expect, test } from "vitest";
import random from "random";

import {
  buildNextForeverReviewQuestion,
  buildNextQuestion,
  gradeTypedAnswer,
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

  test("asks typed word recall after recognition stages are satisfied", () => {
    const word = sessionWord({
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      satisfied_sat_usage: true,
      word: {
        example_sentence: "The terse reply ended the debate.",
        fast_meaning: "brief",
        word: "terse",
      },
    });

    const question = buildNextQuestion(studySession(), [word], null);

    expect(question).toMatchObject({
      answerMode: "typed",
      questionType: "word_recall",
      prompt: "The ______ reply ended the debate.",
    });
  });

  test("asks typed definition recall after word recall is satisfied", () => {
    const word = sessionWord({
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      satisfied_sat_usage: true,
      satisfied_word_recall: true,
      word: { fast_meaning: "brief", word: "terse" },
    });

    const question = buildNextQuestion(studySession(), [word], null);

    expect(question).toMatchObject({
      answerMode: "typed",
      questionType: "definition_recall",
      prompt: "What does terse mean?",
    });
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

  test("spaces the next stage behind another eligible word", () => {
    const latestAttempt: LatestAttempt = {
      created_at: "2026-05-20T12:05:00.000Z",
      question_type: "sat_usage",
      session_word_id: "first-word",
    };
    const firstWord = sessionWord({
      id: "first-word",
      position: 0,
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      satisfied_sat_usage: true,
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

  test("keeps recently attempted weak words behind uncooled words", () => {
    const recentWeakWord = sessionWord({
      id: "recent-weak-word",
      last_attempted_at: "2026-05-20T12:08:00.000Z",
      miss_count: 4,
      position: 0,
      status: "shaky",
      vocab_word_id: 1,
      word: { id: 1 },
    });
    const uncooledWord = sessionWord({
      id: "uncooled-word",
      position: 1,
      vocab_word_id: 2,
      word: { id: 2 },
    });

    const question = buildNextQuestion(
      studySession(),
      [recentWeakWord, uncooledWord],
      [
        {
          created_at: "2026-05-20T12:08:00.000Z",
          question_type: "meaning_recognition",
          session_word_id: "recent-weak-word",
        },
      ],
    );

    expect(question?.targetSessionWordId).toBe("uncooled-word");
  });

  test("weights newer attempt results more than older attempt results", () => {
    const newerMissedWord = sessionWord({
      id: "newer-missed-word",
      last_attempted_at: "2026-05-20T12:04:00.000Z",
      position: 0,
      vocab_word_id: 1,
      word: { id: 1 },
    });
    const olderMissedWord = sessionWord({
      id: "older-missed-word",
      last_attempted_at: "2026-05-20T12:04:00.000Z",
      position: 1,
      vocab_word_id: 2,
      word: { id: 2 },
    });

    const question = buildNextQuestion(
      studySession(),
      [newerMissedWord, olderMissedWord],
      [
        {
          created_at: "2026-05-20T12:05:00.000Z",
          question_type: "meaning_recognition",
          session_word_id: "outside-word",
        },
        {
          created_at: "2026-05-20T12:04:00.000Z",
          question_type: "meaning_recognition",
          result: "incorrect",
          session_word_id: "newer-missed-word",
        },
        {
          created_at: "2026-05-20T12:03:00.000Z",
          question_type: "reverse_recall",
          result: "correct",
          session_word_id: "newer-missed-word",
        },
        {
          created_at: "2026-05-20T12:04:00.000Z",
          question_type: "meaning_recognition",
          result: "correct",
          session_word_id: "older-missed-word",
        },
        {
          created_at: "2026-05-20T12:03:00.000Z",
          question_type: "reverse_recall",
          result: "incorrect",
          session_word_id: "older-missed-word",
        },
      ],
    );

    expect(question?.targetSessionWordId).toBe("newer-missed-word");
  });

  test("raises incorrect and unsure words above correct words", () => {
    const correctWord = sessionWord({
      id: "correct-word",
      position: 0,
      vocab_word_id: 1,
      word: { id: 1 },
    });
    const unsureWord = sessionWord({
      id: "unsure-word",
      position: 1,
      vocab_word_id: 2,
      word: { id: 2 },
    });
    const missedWord = sessionWord({
      id: "missed-word",
      position: 2,
      vocab_word_id: 3,
      word: { id: 3 },
    });

    const question = buildNextQuestion(
      studySession(),
      [correctWord, unsureWord, missedWord],
      [
        {
          created_at: "2026-05-20T12:05:00.000Z",
          question_type: "meaning_recognition",
          session_word_id: "outside-word",
        },
        {
          created_at: "2026-05-20T12:04:00.000Z",
          question_type: "meaning_recognition",
          result: "correct",
          session_word_id: "correct-word",
        },
        {
          created_at: "2026-05-20T12:04:00.000Z",
          question_type: "meaning_recognition",
          result: "unsure",
          session_word_id: "unsure-word",
        },
        {
          created_at: "2026-05-20T12:04:00.000Z",
          question_type: "meaning_recognition",
          result: "incorrect",
          session_word_id: "missed-word",
        },
      ],
    );

    expect(question?.targetSessionWordId).toBe("missed-word");
  });

  test("selects questions from the active six-word daily chunk", () => {
    const firstChunkWords = Array.from({ length: 6 }, (_, index) =>
      sessionWord({
        id: `first-chunk-${index}`,
        position: index,
        vocab_word_id: index + 1,
        word: { id: index + 1 },
      }),
    );
    const secondChunkWord = sessionWord({
      id: "second-chunk-shaky",
      miss_count: 10,
      position: 6,
      status: "shaky",
      vocab_word_id: 7,
      word: { id: 7 },
    });

    const question = buildNextQuestion(
      studySession(),
      [...firstChunkWords, secondChunkWord],
      null,
    );

    expect(question?.targetSessionWordId).toBe("first-chunk-0");
  });

  test("moves to the next daily chunk after the current chunk is recall-ready", () => {
    const readyFirstChunk = Array.from({ length: 6 }, (_, index) =>
      satisfiedWord({
        id: `ready-first-chunk-${index}`,
        position: index,
        vocab_word_id: index + 1,
        word: { id: index + 1 },
      }),
    );
    const secondChunkWord = sessionWord({
      id: "second-chunk-word",
      position: 6,
      vocab_word_id: 7,
      word: { id: 7 },
    });

    const question = buildNextQuestion(
      studySession(),
      [...readyFirstChunk, secondChunkWord],
      null,
    );

    expect(question?.targetSessionWordId).toBe("second-chunk-word");
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

  test("includes studied words as distractors before fallback options", () => {
    const target = sessionWord({
      id: "target",
      vocab_word_id: 1,
      word: { id: 1, word: "target" },
    });
    const studiedSecond = sessionWord({
      id: "studied-second",
      position: 1,
      vocab_word_id: 2,
      word: { id: 2, word: "studied-second" },
    });
    const studiedThird = sessionWord({
      id: "studied-third",
      position: 2,
      vocab_word_id: 3,
      word: { id: 3, word: "studied-third" },
    });
    const question = buildNextQuestion(
      studySession(),
      [target, studiedSecond, studiedThird],
      null,
      [
        vocabWord({ id: 4, word: "fallback-fourth" }),
        vocabWord({ id: 5, word: "fallback-fifth" }),
      ],
    );
    const optionIds = question?.options.map((option) => option.vocabWordId);

    expect(optionIds).toContain(1);
    expect(optionIds).toContain(2);
    expect(optionIds).toContain(3);
    expect(question?.options).toHaveLength(4);
  });

  test("varies the correct option position across deterministic seeds", () => {
    const target = sessionWord({
      vocab_word_id: 1,
      word: { fast_meaning: "target meaning", id: 1, word: "target" },
    });
    const options = [
      target.vocab_word,
      vocabWord({ id: 2, word: "second" }),
      vocabWord({ id: 3, word: "third" }),
      vocabWord({ id: 4, word: "fourth" }),
      vocabWord({ id: 5, word: "fifth" }),
      vocabWord({ id: 6, word: "sixth" }),
    ];
    const correctPositions = new Set<number>();

    for (let index = 0; index < 12; index += 1) {
      const question = buildNextQuestion(
        studySession({
          id: `session-${index}`,
          total_questions_answered: index,
        }),
        [target],
        null,
        options,
      );

      correctPositions.add(
        question?.options.findIndex((option) => option.vocabWordId === 1) ?? -1,
      );
    }

    expect(correctPositions.size).toBeGreaterThan(1);
  });

  test("varies SAT usage example prompts across repeated builds", () => {
    const example_sentence = [
      "The terse reply ended the debate.",
      "Her terse answer made the point quickly.",
      "A terse memo can still be polite.",
      "The judge gave a terse warning.",
      "His terse style suited the urgent message.",
    ].join(" | ");
    const word = sessionWord({
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      word: {
        example_sentence,
        fast_meaning: "brief",
        word: "terse",
      },
    });
    const prompts = new Set<string>();

    random.use("sat-usage-example-test");

    try {
      for (let index = 0; index < 10; index += 1) {
        const question = buildNextQuestion(studySession(), [word], null);

        expect(question?.questionType).toBe("sat_usage");
        prompts.add(question?.prompt ?? "");
      }
    } finally {
      random.use(Math.random);
    }

    expect(prompts.size).toBeGreaterThan(1);
  });
});

describe("typed answer grading", () => {
  test("normalizes exact word recall answers", () => {
    expect(
      gradeTypedAnswer(
        "word_recall",
        vocabWord({ word: "Terse" }),
        " terse! ",
      ),
    ).toBe("correct");
  });

  test("grades definition recall with token overlap", () => {
    expect(
      gradeTypedAnswer(
        "definition_recall",
        vocabWord({ fast_meaning: "brief and clear" }),
        "brief clear",
      ),
    ).toBe("correct");
    expect(
      gradeTypedAnswer(
        "definition_recall",
        vocabWord({ fast_meaning: "brief and clear" }),
        "brief",
      ),
    ).toBe("correct");
    expect(
      gradeTypedAnswer(
        "definition_recall",
        vocabWord({ fast_meaning: "brief and clear" }),
        "short",
      ),
    ).toBe("incorrect");
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

  test("brings attempted weak review words back before first-pass ready words", () => {
    const attemptedWeakWord = sessionWord({
      id: "attempted-weak-word",
      last_attempted_at: "2026-05-20T12:05:00.000Z",
      miss_count: 1,
      position: 0,
      source: "review",
      status: "shaky",
      vocab_word_id: 1,
      word: { id: 1 },
    });
    const unattemptedReadyWord = satisfiedWord({
      id: "unattempted-ready-word",
      last_attempted_at: null,
      position: 1,
      source: "review",
      vocab_word_id: 2,
      word: { id: 2 },
    });

    const question = buildNextForeverReviewQuestion(
      studySession({ session_type: "forever_review" }),
      [attemptedWeakWord, unattemptedReadyWord],
      null,
    );

    expect(question?.targetSessionWordId).toBe("attempted-weak-word");
  });

  test("returns to weak review words after one intervening card", () => {
    const firstWeakWord = sessionWord({
      id: "first-weak-word",
      last_attempted_at: "2026-05-20T12:10:00.000Z",
      miss_count: 4,
      position: 0,
      source: "review",
      status: "shaky",
      vocab_word_id: 1,
      word: { id: 1 },
    });
    const secondWeakWord = sessionWord({
      id: "second-weak-word",
      last_attempted_at: "2026-05-20T12:09:00.000Z",
      miss_count: 4,
      position: 1,
      source: "review",
      status: "shaky",
      vocab_word_id: 2,
      word: { id: 2 },
    });
    const readyWord = satisfiedWord({
      id: "ready-word",
      last_attempted_at: "2026-05-20T11:50:00.000Z",
      position: 2,
      source: "review",
      vocab_word_id: 3,
      word: { id: 3 },
    });

    const question = buildNextForeverReviewQuestion(
      studySession({ session_type: "forever_review" }),
      [firstWeakWord, secondWeakWord, readyWord],
      [
        {
          created_at: "2026-05-20T12:10:00.000Z",
          question_type: "meaning_recognition",
          session_word_id: "first-weak-word",
        },
        {
          created_at: "2026-05-20T12:09:00.000Z",
          question_type: "meaning_recognition",
          session_word_id: "second-weak-word",
        },
      ],
    );

    expect(question?.targetSessionWordId).toBe("second-weak-word");
  });

  test("falls back to cooled review words when every candidate is recent", () => {
    const onlyWord = satisfiedWord({
      id: "only-word",
      source: "review",
    });

    const question = buildNextForeverReviewQuestion(
      studySession({ session_type: "forever_review" }),
      [onlyWord],
      [
        {
          created_at: "2026-05-20T12:10:00.000Z",
          question_type: "meaning_recognition",
          session_word_id: "only-word",
        },
      ],
    );

    expect(question?.targetSessionWordId).toBe("only-word");
  });

  test("uses six-word chunks for forever review", () => {
    const firstChunkWords = Array.from({ length: 6 }, (_, index) =>
      sessionWord({
        id: `first-review-chunk-${index}`,
        miss_count: 10,
        position: index,
        source: "review",
        status: "shaky",
        vocab_word_id: index + 1,
        word: { id: index + 1 },
      }),
    );
    const secondChunkWord = satisfiedWord({
      id: "second-review-chunk",
      position: 6,
      source: "review",
      vocab_word_id: 7,
      word: { id: 7 },
    });

    const question = buildNextForeverReviewQuestion(
      studySession({
        session_type: "forever_review",
        total_questions_answered: 6,
      }),
      [...firstChunkWords, secondChunkWord],
      null,
    );

    expect(question?.targetSessionWordId).toBe("second-review-chunk");
  });
});
