import { describe, expect, test } from "vitest";

import {
  applyOptimisticAnswerReview,
  applyOptimisticAnswer,
  applyOptimisticForeverReviewAnswerReview,
  applyOptimisticForeverReviewAnswer,
  applyOptimisticForeverReviewGuess,
  applyOptimisticGuess,
  buildMultipleChoiceAnswerReview,
  buildTypedAnswerReview,
} from "@/lib/study/optimistic-session";
import type {
  ForeverReviewView,
  PendingGuess,
  QuestionType,
  SessionView,
  StudyQuestion,
} from "@/lib/study/types";
import { satisfiedWord, sessionWord, studySession, vocabWord } from "./factories";

type QuestionView = Extract<SessionView, { screen: "question" }>;

function studyQuestion(
  overrides: Partial<StudyQuestion> & {
    questionType: QuestionType;
    targetSessionWordId: string;
    targetVocabWordId: number;
  },
): StudyQuestion {
  return {
    answerMode: "multiple_choice",
    helperText: "Choose.",
    options: [
      { label: "correct", vocabWordId: overrides.targetVocabWordId },
      { label: "wrong", vocabWordId: 999 },
    ],
    prompt: "Prompt",
    ...overrides,
  };
}

function questionView(overrides: Partial<QuestionView> = {}): QuestionView {
  const word = sessionWord();
  const question = studyQuestion({
    questionType: "meaning_recognition",
    targetSessionWordId: word.id,
    targetVocabWordId: word.vocab_word_id,
  });

  return {
    optionWords: [word.vocab_word, vocabWord({ id: 999 })],
    question,
    readyCount: 0,
    recentAttempts: [],
    screen: "question",
    session: studySession(),
    totalWords: 1,
    words: [word],
    ...overrides,
  };
}

function foreverReviewView(
  overrides: Partial<ForeverReviewView> = {},
): ForeverReviewView {
  const word = sessionWord({
    source: "review",
    status: "shaky",
  });
  const question = studyQuestion({
    questionType: "meaning_recognition",
    targetSessionWordId: word.id,
    targetVocabWordId: word.vocab_word_id,
  });

  return {
    checkpoint: {
      correctCount: 0,
      questionsAnswered: 0,
      strengthenedCount: 0,
      weakWordsFound: 0,
    },
    mode: "forever_review",
    optionWords: [word.vocab_word, vocabWord({ id: 999 })],
    question,
    readyCount: 0,
    recentAttempts: [],
    screen: "question",
    session: studySession({ session_type: "forever_review" }),
    totalWords: 1,
    words: [word],
    ...overrides,
  };
}

describe("optimistic daily answers", () => {
  test("marks an incorrect answer as missed", () => {
    const view = questionView();
    const result = applyOptimisticAnswer(
      view,
      view.question,
      999,
      "attempt-1",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.correction?.targetWord).toMatchObject({
      id: "session-word-1",
      last_attempted_at: "2026-05-20T12:10:00.000Z",
      last_question_type: "meaning_recognition",
      miss_count: 1,
      status: "shaky",
    });
    expect(result.nextView.screen).toBe("question");
    expect(result.nextView.session.total_questions_answered).toBe(1);
  });

  test("credits a correct answer", () => {
    const view = questionView();
    const result = applyOptimisticAnswer(
      view,
      view.question,
      view.question.targetVocabWordId,
      "attempt-1",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.nextView.screen).toBe("question");
    expect(result.nextView.words[0]).toMatchObject({
      correct_count: 1,
      last_question_type: "meaning_recognition",
      satisfied_meaning_recognition: true,
      status: "stable",
    });
  });

  test("asks for a guess check on first correct SAT usage answer", () => {
    const word = sessionWord({
      satisfied_definition_recall: true,
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      satisfied_word_recall: true,
    });
    const question = studyQuestion({
      questionType: "sat_usage",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    const view = questionView({ question, words: [word] });

    const result = applyOptimisticAnswer(
      view,
      question,
      word.vocab_word_id,
      "attempt-1",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.pendingGuess).toEqual({
      attemptId: "attempt-1",
      sessionWordId: word.id,
      word: word.vocab_word,
    });
    expect(result.nextView.words[0]).toMatchObject({
      correct_count: 0,
      satisfied_sat_usage: false,
    });
  });

  test("completes the session when the final requirement is satisfied", () => {
    const word = sessionWord({
      satisfied_definition_recall: true,
      satisfied_reverse_recall: true,
      satisfied_sat_usage: true,
      satisfied_word_recall: true,
    });
    const question = studyQuestion({
      questionType: "meaning_recognition",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    const view = questionView({ question, words: [word] });

    const result = applyOptimisticAnswer(
      view,
      question,
      word.vocab_word_id,
      "attempt-1",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.nextView).toMatchObject({
      screen: "complete",
      session: {
        completed_at: "2026-05-20T12:10:00.000Z",
        completion_reason: "mastered",
        phase: "complete",
        total_questions_answered: 1,
      },
    });
  });

  test("completes the session when the question cap is reached", () => {
    const view = questionView({
      session: studySession({
        question_cap: 1,
      }),
    });

    const result = applyOptimisticAnswer(
      view,
      view.question,
      999,
      "attempt-1",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.nextView).toMatchObject({
      screen: "complete",
      session: {
        completion_reason: "question_cap",
        phase: "complete",
      },
    });
  });

  test("throws when the active word is missing", () => {
    const view = questionView({ words: [] });

    expect(() =>
      applyOptimisticAnswer(
        view,
        view.question,
        1,
        "attempt-1",
        "2026-05-20T12:10:00.000Z",
      ),
    ).toThrow("Unable to find the active word.");
  });
});

describe("optimistic daily guess checks", () => {
  test("marks a guessed SAT usage answer as shaky", () => {
    const word = sessionWord({
      satisfied_definition_recall: true,
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      satisfied_word_recall: true,
    });
    const question = studyQuestion({
      questionType: "sat_usage",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    const view = questionView({ question, words: [word] });
    const pendingGuess: PendingGuess = {
      attemptId: "attempt-1",
      sessionWordId: word.id,
      word: word.vocab_word,
    };

    const nextView = applyOptimisticGuess(
      view,
      pendingGuess,
      "guessed",
      "2026-05-20T12:15:00.000Z",
    );

    expect(nextView.words[0]).toMatchObject({
      guessed_count: 1,
      last_question_type: "sat_usage",
      status: "shaky",
    });
  });

  test("credits a known SAT usage answer after the guess check", () => {
    const word = sessionWord({
      satisfied_definition_recall: true,
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      satisfied_word_recall: true,
    });
    const question = studyQuestion({
      questionType: "sat_usage",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    const view = questionView({ question, words: [word] });
    const pendingGuess: PendingGuess = {
      attemptId: "attempt-1",
      sessionWordId: word.id,
      word: word.vocab_word,
    };

    const nextView = applyOptimisticGuess(
      view,
      pendingGuess,
      "known",
      "2026-05-20T12:15:00.000Z",
    );

    expect(nextView.screen).toBe("complete");
    expect(nextView.words[0]).toMatchObject({
      correct_count: 1,
      satisfied_sat_usage: true,
      status: "recall_ready",
    });
  });
});

describe("optimistic daily answer reviews", () => {
  test("marks an unsure correct multiple-choice answer as shaky", () => {
    const view = questionView();
    const review = buildMultipleChoiceAnswerReview(
      view,
      view.question,
      view.question.targetVocabWordId,
      "attempt-1",
    );

    const result = applyOptimisticAnswerReview(
      view,
      review,
      "unsure",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.nextView.words[0]).toMatchObject({
      guessed_count: 1,
      last_question_type: "meaning_recognition",
      status: "shaky",
    });
  });

  test("credits a marked-right multiple-choice miss", () => {
    const view = questionView();
    const review = buildMultipleChoiceAnswerReview(
      view,
      view.question,
      999,
      "attempt-1",
    );

    const result = applyOptimisticAnswerReview(
      view,
      review,
      "correct",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.nextView.words[0]).toMatchObject({
      correct_count: 1,
      satisfied_meaning_recognition: true,
      status: "stable",
    });
  });

  test("credits a correct word recall answer review", () => {
    const word = sessionWord({
      word: { word: "terse" },
    });
    const question = studyQuestion({
      answerMode: "typed",
      options: [],
      questionType: "word_recall",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    const view = questionView({ question, words: [word] });
    const review = buildTypedAnswerReview(view, question, "terse", "attempt-1");

    const result = applyOptimisticAnswerReview(
      view,
      review,
      review.systemGrade,
      "2026-05-20T12:10:00.000Z",
    );

    expect(review.systemGrade).toBe("correct");
    expect(result.nextView.words[0]).toMatchObject({
      correct_count: 1,
      satisfied_word_recall: true,
      status: "stable",
    });
  });

  test("credits a marked-right word recall answer", () => {
    const word = sessionWord({
      word: { word: "terse" },
    });
    const question = studyQuestion({
      answerMode: "typed",
      options: [],
      questionType: "word_recall",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    const view = questionView({ question, words: [word] });
    const review = buildTypedAnswerReview(view, question, "tersee", "attempt-1");

    const result = applyOptimisticAnswerReview(
      view,
      review,
      "correct",
      "2026-05-20T12:10:00.000Z",
    );

    expect(review.systemGrade).toBe("incorrect");
    expect(result.nextView.words[0]).toMatchObject({
      correct_count: 1,
      satisfied_word_recall: true,
      status: "stable",
    });
  });

  test("credits a one-token definition answer review", () => {
    const word = sessionWord({
      word: {
        fast_meaning: "quietly skilled",
        word: "adroit",
      },
    });
    const question = studyQuestion({
      answerMode: "typed",
      options: [],
      questionType: "definition_recall",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    const view = questionView({ question, words: [word] });
    const review = buildTypedAnswerReview(view, question, "quietly", "attempt-1");

    const result = applyOptimisticAnswerReview(
      view,
      review,
      review.systemGrade,
      "2026-05-20T12:10:00.000Z",
    );

    expect(review.systemGrade).toBe("correct");
    expect(result.nextView.words[0]).toMatchObject({
      correct_count: 1,
      satisfied_definition_recall: true,
      status: "stable",
    });
  });
});

describe("optimistic forever review", () => {
  test("tracks correct answers in the checkpoint", () => {
    const view = foreverReviewView({
      words: [
        sessionWord({
          id: "target",
          source: "review",
          status: "shaky",
          vocab_word_id: 1,
          word: { id: 1 },
        }),
        sessionWord({
          id: "next",
          source: "review",
          status: "shaky",
          vocab_word_id: 2,
          word: { id: 2 },
        }),
      ],
    });
    const question = studyQuestion({
      questionType: "meaning_recognition",
      targetSessionWordId: "target",
      targetVocabWordId: 1,
    });

    const result = applyOptimisticForeverReviewAnswer(
      { ...view, question },
      question,
      1,
      "attempt-1",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.nextView.checkpoint).toMatchObject({
      correctCount: 1,
      questionsAnswered: 1,
      weakWordsFound: 0,
    });
  });

  test("tracks newly found weak words in the checkpoint", () => {
    const word = satisfiedWord({
      id: "target",
      source: "review",
      vocab_word_id: 1,
      word: { id: 1 },
    });
    const question = studyQuestion({
      questionType: "meaning_recognition",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    const view = foreverReviewView({ question, words: [word] });

    const result = applyOptimisticForeverReviewAnswer(
      view,
      question,
      999,
      "attempt-1",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.correction?.targetWord).toMatchObject({
      miss_count: 1,
      status: "shaky",
    });
    expect(result.nextView.checkpoint.weakWordsFound).toBe(1);
  });

  test("tracks strengthened words after a known SAT usage guess check", () => {
    const word = sessionWord({
      id: "target",
      source: "review",
      satisfied_definition_recall: true,
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      satisfied_word_recall: true,
      status: "shaky",
    });
    const question = studyQuestion({
      questionType: "sat_usage",
      targetSessionWordId: word.id,
      targetVocabWordId: word.vocab_word_id,
    });
    const view = foreverReviewView({ question, words: [word] });
    const pendingGuess: PendingGuess = {
      attemptId: "attempt-1",
      sessionWordId: word.id,
      word: word.vocab_word,
    };

    const nextView = applyOptimisticForeverReviewGuess(
      view,
      pendingGuess,
      "known",
      "2026-05-20T12:15:00.000Z",
    );

    expect(nextView.checkpoint.strengthenedCount).toBe(1);
    expect(nextView.words[0].status).toBe("recall_ready");
  });

  test("tracks checkpoint stats after a finalized answer review", () => {
    const view = foreverReviewView({
      words: [
        sessionWord({
          id: "target",
          source: "review",
          status: "shaky",
          vocab_word_id: 1,
          word: { id: 1 },
        }),
        sessionWord({
          id: "next",
          source: "review",
          status: "shaky",
          vocab_word_id: 2,
          word: { id: 2 },
        }),
      ],
    });
    const question = studyQuestion({
      questionType: "meaning_recognition",
      targetSessionWordId: "target",
      targetVocabWordId: 1,
    });
    const review = buildMultipleChoiceAnswerReview(
      { ...view, question },
      question,
      1,
      "attempt-1",
    );

    const result = applyOptimisticForeverReviewAnswerReview(
      { ...view, question },
      review,
      "correct",
      "2026-05-20T12:10:00.000Z",
    );

    expect(result.nextView.checkpoint).toMatchObject({
      correctCount: 1,
      questionsAnswered: 1,
      weakWordsFound: 0,
    });
  });
});
