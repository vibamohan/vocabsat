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
  ReviewStartScreen,
} from "@/components/study/session-screens";
import type {
  ForeverReviewView,
  ForeverReviewSummary,
  PendingAnswerReview,
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

function typedQuestionView(): Extract<SessionView, { screen: "question" }> {
  const view = questionView();

  return {
    ...view,
    question: {
      ...view.question,
      answerMode: "typed",
      options: [],
      questionType: "word_recall",
    },
  };
}

function reviewQuestionView(): ForeverReviewView {
  const view = questionView();

  return {
    checkpoint: {
      correctCount: 5,
      questionsAnswered: 7,
      strengthenedCount: 1,
      weakWordsFound: 2,
    },
    mode: "forever_review",
    optionWords: view.optionWords,
    question: view.question,
    readyCount: view.readyCount,
    recentAttempts: view.recentAttempts,
    screen: "question",
    session: studySession({
      session_type: "forever_review",
      total_questions_answered: 7,
    }),
    totalWords: view.totalWords,
    words: view.words,
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

  test("labels question options with numeric shortcuts", () => {
    render(<QuestionScreen onAnswer={vi.fn()} view={questionView()} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });

  test("submits the first question option with the 1 key", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const view = questionView();

    render(<QuestionScreen onAnswer={onAnswer} view={view} />);
    await user.keyboard("1");

    expect(onAnswer).toHaveBeenCalledWith(view.question, 1);
  });

  test("submits the second question option with the 2 key", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const view = questionView();

    render(<QuestionScreen onAnswer={onAnswer} view={view} />);
    await user.keyboard("2");

    expect(onAnswer).toHaveBeenCalledWith(view.question, 2);
  });

  test("ignores number shortcuts outside the rendered option count", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();

    render(<QuestionScreen onAnswer={onAnswer} view={questionView()} />);
    await user.keyboard("4");

    expect(onAnswer).not.toHaveBeenCalled();
  });

  test("disables question options while pending", () => {
    render(<QuestionScreen isPending onAnswer={vi.fn()} view={questionView()} />);

    expect(screen.getByRole("button", { name: /brief/i })).toBeDisabled();
  });

  test("ignores number shortcuts while pending", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();

    render(
      <QuestionScreen isPending onAnswer={onAnswer} view={questionView()} />,
    );
    await user.keyboard("1");

    expect(onAnswer).not.toHaveBeenCalled();
  });

  test("shows one aggregate daily mastery progress bar", () => {
    const view = questionView();
    const readyWord = satisfiedWord({
      id: "ready-word",
      vocab_word_id: 2,
      word: { id: 2, word: "candid" },
    });

    render(
      <QuestionScreen
        onAnswer={vi.fn()}
        view={{
          ...view,
          readyCount: 1,
          totalWords: 2,
          words: [readyWord, view.words[0]],
        }}
      />,
    );

    const progressBars = screen.getAllByRole("progressbar", {
      name: "Daily mastery",
    });
    const fill = progressBars[0].firstElementChild as HTMLElement;

    expect(progressBars).toHaveLength(1);
    expect(progressBars[0]).toHaveAttribute("aria-valuenow", "50");
    expect(progressBars[0]).toHaveClass("h-2.5");
    expect(fill.style.width).toBe("50%");
  });

  test("shows simple counters for forever review progress", () => {
    render(
      <QuestionScreen
        onAnswer={vi.fn()}
        variant="review"
        view={reviewQuestionView()}
      />,
    );

    expect(screen.getByText("Forever Review")).toBeInTheDocument();
    expect(screen.getByText("7 reviewed today")).toBeInTheDocument();
    expect(screen.getByText("2 unfamiliar")).toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: "Review strength" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Review strength")).not.toBeInTheDocument();
  });

  test("submits a typed question answer", async () => {
    const user = userEvent.setup();
    const onTypedAnswer = vi.fn();
    const view = typedQuestionView();

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

  test("does not treat typed answer digits as number shortcuts", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();

    render(
      <QuestionScreen
        onAnswer={onAnswer}
        onTypedAnswer={vi.fn()}
        view={typedQuestionView()}
      />,
    );
    await user.type(screen.getByRole("textbox"), "1234");

    expect(screen.getByRole("textbox")).toHaveValue("1234");
    expect(onAnswer).not.toHaveBeenCalled();
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

  test("continues from a correction screen with the space key", async () => {
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
    await user.keyboard("[Space]");

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
    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getByText("Terse most nearly means:")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark right" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unsure" })).toBeInTheDocument();
    expect(screen.getAllByText("brief")).toHaveLength(1);
    expect(screen.getByText("Term: Terse")).toBeInTheDocument();
    expect(onGrade).toHaveBeenCalledWith("correct");
  });

  test("continues from a unified correct answer review with the space key", async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();

    render(<AnswerReviewScreen onGrade={onGrade} review={answerReview()} />);
    await user.keyboard("[Space]");

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
    expect(screen.getByText("detailed")).toBeInTheDocument();
    expect(screen.getByText("Term: Verbose")).toBeInTheDocument();
    expect(screen.getByText("Correct answer")).toBeInTheDocument();
    expect(screen.getByText("brief")).toBeInTheDocument();
    expect(screen.getByText("Term: Terse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark right" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark wrong" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unsure" }),
    ).not.toBeInTheDocument();
  });

  test("keeps word choices as the primary answer review text", () => {
    render(
      <AnswerReviewScreen
        onGrade={vi.fn()}
        review={answerReview({
          question: {
            ...questionView().question,
            helperText: "Choose the word.",
            prompt: 'Which word means "brief"?',
            questionType: "reverse_recall",
          },
          selectedVocabWordId: 2,
          selectedWord: sessionWord({
            vocab_word_id: 2,
            word: { fast_meaning: "detailed", id: 2, word: "verbose" },
          }).vocab_word,
          systemGrade: "incorrect",
        })}
      />,
    );

    expect(screen.getByText("Verbose")).toBeInTheDocument();
    expect(screen.getByText("detailed")).toBeInTheDocument();
    expect(screen.getByText("Correct answer")).toBeInTheDocument();
    expect(screen.getByText("Terse")).toBeInTheDocument();
    expect(screen.getByText("brief")).toBeInTheDocument();
    expect(screen.queryByText("Term: Verbose")).not.toBeInTheDocument();
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

  test("continues from an unsure typed answer review with the space key", async () => {
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
    await user.keyboard("[Space]");

    expect(onGrade).toHaveBeenCalledWith("unsure");
  });

  test("keeps space native when focus is on a secondary answer review action", async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();

    render(<AnswerReviewScreen onGrade={onGrade} review={answerReview()} />);
    screen.getByRole("button", { name: "Mark wrong" }).focus();
    await user.keyboard("[Space]");

    expect(onGrade).toHaveBeenCalledTimes(1);
    expect(onGrade).toHaveBeenCalledWith("incorrect");
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
});
