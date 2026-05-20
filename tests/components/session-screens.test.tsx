import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
  CompletionScreen,
  CorrectionScreen,
  GuessCheckScreen,
  LearnScreen,
  QuestionScreen,
  ReviewCheckpointScreen,
  ReviewStartScreen,
} from "@/components/study/session-screens";
import type {
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

function questionView(): Extract<SessionView, { screen: "question" }> {
  const word = sessionWord({
    word: {
      fast_meaning: "brief",
      word: "terse",
    },
  });
  const question: StudyQuestion = {
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

    render(
      <CorrectionScreen
        onContinue={onContinue}
        word={sessionWord({ word: { fast_meaning: "brief", word: "terse" } })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
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
