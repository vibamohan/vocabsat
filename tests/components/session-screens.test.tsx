import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
  AnswerReviewScreen,
  CompletionScreen,
  CorrectionScreen,
  DefinitionSelfCheckScreen,
  GuessCheckScreen,
  LearnScreen,
  QuestionScreen,
  ReviewCheckpointScreen,
  ReviewStartScreen,
} from "@/components/study/session-screens";
import type {
  PendingAnswerReview,
  ForeverReviewSummary,
  PendingGuess,
  SessionView,
  StudyQuestion,
} from "@/lib/study/types";
import { satisfiedWord, sessionWord, studySession } from "../study/factories";

function learnView(): Extract<SessionView, { screen: "learn" }> {
  const word = sessionWord({
    word: {
      example_sentence: "The candid answer surprised everyone.",
      fast_meaning: "honest and direct",
      word: "candid",
    },
  });

  return {
    currentIndex: 0,
    currentWord: word,
    learnWords: [word],
    screen: "learn",
    session: studySession({ phase: "learn" }),
    totalWords: 1,
    words: [word],
  };
}

function answerReview(
  overrides: Partial<PendingAnswerReview> = {},
): PendingAnswerReview {
  const view = questionView();
  const selectedWord = view.words[0].vocab_word;

  return {
    answerMode: "multiple_choice",
    attemptId: "attempt-1",
    question: view.question,
    selectedVocabWordId: selectedWord.id,
    selectedWord,
    systemGrade: "correct",
    targetWord: view.words[0],
    ...overrides,
  };
}

function questionView(): Extract<SessionView, { screen: "question" }> {
  const word = sessionWord({
    word: {
      fast_meaning: "brief",
      word: "terse",
    },
  });
  const question: StudyQuestion = {
    answerMode: "multiple_choice",
    helperText: "Choose the meaning.",
    options: [
      { label: "brief", vocabWordId: word.vocab_word_id },
      { label: "detailed", vocabWordId: 2 },
    ],
    prompt: "Terse most nearly means:",
    questionType: "meaning_recognition",
    targetSessionWordId: word.id,
    targetVocabWordId: word.vocab_word_id,
  };

  return {
    optionWords: [word.vocab_word],
    question,
    readyCount: 0,
    recentAttempts: [],
    screen: "question",
    session: studySession(),
    totalWords: 1,
    words: [word],
  };
}

function reviewSummary(
  overrides: Partial<ForeverReviewSummary> = {},
): ForeverReviewSummary {
  return {
    dueCount: 0,
    eligibleWordCount: 3,
    staleCount: 0,
    studyDate: "2026-05-20",
    weakCount: 0,
    ...overrides,
  };
}

describe("study session screens", () => {
  test("continues from the learn screen", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    render(
      <LearnScreen
        onContinue={onContinue}
        onReplaceKnown={vi.fn()}
        view={learnView()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("replaces a known learn word", async () => {
    const user = userEvent.setup();
    const onReplaceKnown = vi.fn();

    render(
      <LearnScreen
        onContinue={vi.fn()}
        onReplaceKnown={onReplaceKnown}
        view={learnView()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Already know it" }));

    expect(onReplaceKnown).toHaveBeenCalledTimes(1);
  });

  test("submits the selected question option", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const view = questionView();

    render(<QuestionScreen onAnswer={onAnswer} view={view} />);
    await user.click(screen.getByRole("button", { name: /brief/i }));

    expect(onAnswer).toHaveBeenCalledWith(view.question, 1);
  });

  test("disables question options while pending", () => {
    render(<QuestionScreen isPending onAnswer={vi.fn()} view={questionView()} />);

    expect(screen.getByRole("button", { name: /brief/i })).toBeDisabled();
  });

  test("submits a typed question answer", async () => {
    const user = userEvent.setup();
    const onTypedAnswer = vi.fn();
    const view = {
      ...questionView(),
      question: {
        ...questionView().question,
        answerMode: "typed" as const,
        options: [],
        questionType: "word_recall" as const,
      },
    };

    render(
      <QuestionScreen
        onAnswer={vi.fn()}
        onTypedAnswer={onTypedAnswer}
        view={view}
      />,
    );
    await user.type(screen.getByRole("textbox"), "terse");
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(onTypedAnswer).toHaveBeenCalledWith(view.question, "terse");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  test("starts forever review when learned words exist", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(<ReviewStartScreen onStart={onStart} summary={reviewSummary()} />);
    await user.click(screen.getByRole("button", { name: "Start Review" }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test("disables forever review when no words exist", () => {
    render(
      <ReviewStartScreen
        onStart={vi.fn()}
        summary={reviewSummary({ eligibleWordCount: 0 })}
      />,
    );

    expect(screen.getByRole("button", { name: "Start Review" })).toBeDisabled();
  });

  test("continues from a correction screen", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const word = sessionWord({ word: { fast_meaning: "brief", word: "terse" } });

    render(
      <CorrectionScreen
        correction={{
          answerMode: "multiple_choice",
          questionType: "meaning_recognition",
          targetWord: word,
        }}
        onContinue={onContinue}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("shows selected distractor on a correction screen", () => {
    const word = sessionWord({ word: { fast_meaning: "brief", word: "terse" } });
    const selectedWord = sessionWord({
      vocab_word_id: 2,
      word: { fast_meaning: "detailed", id: 2, word: "verbose" },
    }).vocab_word;

    render(
      <CorrectionScreen
        correction={{
          answerMode: "multiple_choice",
          questionType: "meaning_recognition",
          selectedWord,
          targetWord: word,
        }}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText("You chose")).toBeInTheDocument();
    expect(screen.getByText("Verbose")).toBeInTheDocument();
    expect(screen.getByText("Correct answer")).toBeInTheDocument();
    expect(screen.getAllByText("Terse")).toHaveLength(1);
  });

  test("continues from a unified correct answer review", async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();

    render(<AnswerReviewScreen onGrade={onGrade} review={answerReview()} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark right" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unsure" })).toBeInTheDocument();
    expect(screen.getAllByText("Terse")).toHaveLength(1);
    expect(screen.getAllByText("brief")).toHaveLength(1);
    expect(onGrade).toHaveBeenCalledWith("correct");
  });

  test("overrides an answer review as wrong", async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();

    render(<AnswerReviewScreen onGrade={onGrade} review={answerReview()} />);
    await user.click(screen.getByRole("button", { name: "Mark wrong" }));

    expect(onGrade).toHaveBeenCalledWith("incorrect");
  });

  test("only allows mark right on an incorrect answer review", () => {
    render(
      <AnswerReviewScreen
        onGrade={vi.fn()}
        review={answerReview({
          selectedVocabWordId: 2,
          selectedWord: sessionWord({
            vocab_word_id: 2,
            word: { fast_meaning: "detailed", id: 2, word: "verbose" },
          }).vocab_word,
          systemGrade: "incorrect",
        })}
      />,
    );

    expect(screen.getByText("Incorrect")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark right" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark wrong" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unsure" }),
    ).not.toBeInTheDocument();
  });

  test("continues from an unsure typed answer review", async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();

    render(
      <AnswerReviewScreen
        onGrade={onGrade}
        review={answerReview({
          answerMode: "typed",
          selectedVocabWordId: undefined,
          selectedWord: undefined,
          systemGrade: "unsure",
          typedAnswer: "short",
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getAllByText("Unsure").length).toBeGreaterThan(0);
    expect(screen.getByText("You typed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark right" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark wrong" })).toBeInTheDocument();
    expect(onGrade).toHaveBeenCalledWith("unsure");
  });

  test("self-grades a definition recall answer", async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();

    render(
      <DefinitionSelfCheckScreen
        onGrade={onGrade}
        typedAnswer="short"
        word={sessionWord({ word: { fast_meaning: "brief", word: "terse" } })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "I was right" }));

    expect(onGrade).toHaveBeenCalledWith("correct");
  });

  test("records a known guess check", async () => {
    const user = userEvent.setup();
    const onGuess = vi.fn();
    const pendingGuess: PendingGuess = {
      attemptId: "attempt-1",
      sessionWordId: "session-word-1",
      word: sessionWord({ word: { word: "terse" } }).vocab_word,
    };

    render(<GuessCheckScreen onGuess={onGuess} pendingGuess={pendingGuess} />);
    await user.click(screen.getByRole("button", { name: "Knew it" }));

    expect(onGuess).toHaveBeenCalledWith("attempt-1", "known");
  });

  test("records a guessed guess check", async () => {
    const user = userEvent.setup();
    const onGuess = vi.fn();
    const pendingGuess: PendingGuess = {
      attemptId: "attempt-1",
      sessionWordId: "session-word-1",
      word: sessionWord({ word: { word: "terse" } }).vocab_word,
    };

    render(<GuessCheckScreen onGuess={onGuess} pendingGuess={pendingGuess} />);
    await user.click(screen.getByRole("button", { name: "Guessed" }));

    expect(onGuess).toHaveBeenCalledWith("attempt-1", "guessed");
  });

  test("shows carry-over copy when the question cap leaves weak words", () => {
    const weakWord = sessionWord({
      id: "weak-word",
      miss_count: 1,
      status: "shaky",
      word: { word: "terse" },
    });
    const readyWord = satisfiedWord({
      id: "ready-word",
      vocab_word_id: 2,
      word: { id: 2, word: "candid" },
    });
    const view: Extract<SessionView, { screen: "complete" }> = {
      screen: "complete",
      session: studySession({
        completion_reason: "question_cap",
        phase: "complete",
      }),
      stats: {
        extraReviewCount: 1,
        learnedCount: 2,
        newCount: 2,
        questionsAnswered: 45,
        readyCount: 1,
        reviewCount: 0,
        reviewReadyCount: 0,
        weakCarryOverCount: 1,
      },
      words: [weakWord, readyWord],
    };

    render(<CompletionScreen onFinish={vi.fn()} view={view} />);

    expect(
      screen.getByText("1 weak word will lead your next review."),
    ).toBeInTheDocument();
  });

  test("continues from a review checkpoint", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    render(
      <ReviewCheckpointScreen
        checkpoint={{
          correctCount: 8,
          questionsAnswered: 10,
          strengthenedCount: 2,
          weakWordsFound: 1,
        }}
        onContinue={onContinue}
        onStop={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Keep Reviewing" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("stops from a review checkpoint", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();

    render(
      <ReviewCheckpointScreen
        checkpoint={{
          correctCount: 8,
          questionsAnswered: 10,
          strengthenedCount: 2,
          weakWordsFound: 1,
        }}
        onContinue={vi.fn()}
        onStop={onStop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
