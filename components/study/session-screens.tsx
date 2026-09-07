"use client";

import { ArrowRight, BookOpenCheck, Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SpeechButton } from "@/components/study/speech-button";
import { WordEnrichment } from "@/components/study/word-enrichment";
import { WordNoteEditor } from "@/components/study/word-note-editor";
import { QuestionCountdown } from "@/components/study/question-countdown";
import { getPrimaryExampleSentence } from "@/lib/study/example-sentences";
import { getQuestionTypeLabel } from "@/lib/study/questions";
import { getStudyProgress, type StudyProgress } from "@/lib/study/progress";
import type {
  AnswerConfidence,
  AnswerReviewGrade,
  CorrectionFeedback,
  DefinitionSelfGrade,
  ForeverReviewSummary,
  ForeverReviewView,
  PendingAnswerReview,
  PendingGuess,
  StudyQuestion,
  SessionView,
  SessionWordWithWord,
} from "@/lib/study/types";

type LearnView = Extract<SessionView, { screen: "learn" }>;
type QuestionView = Extract<SessionView, { screen: "question" }>;
type CompleteView = Extract<SessionView, { screen: "complete" }>;
type QuestionScreenView = QuestionView | ForeverReviewView;
type StudyProgressContext =
  | {
      readyCount: number;
      variant: "daily";
      words: SessionWordWithWord[];
    }
  | {
      reviewedCount: number;
      unfamiliarCount: number;
      variant: "review";
    };

export function LearnScreen({
  isPending,
  onContinue,
  onReplaceKnown,
  userId,
  view,
}: {
  isPending?: boolean;
  onContinue: () => void;
  onReplaceKnown: () => void;
  userId?: string;
  view: LearnView;
}) {
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">
            Learn {view.currentIndex + 1} of {view.totalWords}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <CardTitle className="text-4xl leading-tight">
            {capitalize(view.currentWord.vocab_word.word)}
          </CardTitle>
          <SpeechButton
            label={`Pronounce ${view.currentWord.vocab_word.word}`}
            text={view.currentWord.vocab_word.word}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Definition
          </p>
          <p className="text-lg leading-relaxed">
            {view.currentWord.vocab_word.fast_meaning}
          </p>
        </div>
        <WordEnrichment word={view.currentWord.vocab_word} />
        <WordNoteEditor
          userId={userId}
          vocabWordId={view.currentWord.vocab_word_id}
        />
        <Separator />
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Example
          </p>
          <p className="leading-relaxed text-muted-foreground">
            {getPrimaryExampleSentence(
              view.currentWord.vocab_word.example_sentence,
            )}
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex flex-wrap gap-3">
          <Button disabled={isPending} onClick={onContinue} type="button">
            Continue
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            disabled={isPending}
            onClick={onReplaceKnown}
            type="button"
            variant="outline"
          >
            <Check data-icon="inline-start" />
            Already know it
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export function QuestionScreen({
  isPending,
  onAnswer,
  onTypedAnswer,
  onTimeout,
  onToggleTimedMode,
  timedMode = false,
  timerSeconds = 30,
  variant = "daily",
  view,
}: {
  isPending?: boolean;
  onAnswer: (question: StudyQuestion, selectedVocabWordId: number) => void;
  onTypedAnswer?: (question: StudyQuestion, typedAnswer: string) => void;
  onTimeout?: (question: StudyQuestion) => void;
  onToggleTimedMode?: () => void;
  timedMode?: boolean;
  timerSeconds?: number;
  variant?: "daily" | "review";
  view: QuestionScreenView;
}) {
  const handleNumberAnswer = useCallback(
    (event: KeyboardEvent) => {
      if (
        isPending ||
        view.question.answerMode === "typed" ||
        shouldIgnoreStudyShortcut(event)
      ) {
        return;
      }

      const optionIndex = getNumberShortcutIndex(event);

      if (optionIndex === null) {
        return;
      }

      const option = view.question.options[optionIndex];

      if (!option) {
        return;
      }

      event.preventDefault();
      onAnswer(view.question, option.vocabWordId);
    },
    [isPending, onAnswer, view.question],
  );

  useStudyKeydown(handleNumberAnswer);

  return (
    <StudyStage
      progressContext={
        variant === "review" && "checkpoint" in view
          ? {
              reviewedCount: view.session.total_questions_answered,
              unfamiliarCount: view.checkpoint.weakWordsFound,
              variant: "review",
            }
          : {
              readyCount: view.readyCount,
              variant: "daily",
              words: view.words,
            }
      }
    >
      <Card className="w-full">
        <CardHeader className="gap-3 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <CardDescription className="font-medium">
              {getQuestionTypeLabel(view.question.questionType)}
            </CardDescription>
            <div className="flex items-center gap-2">
              {timedMode && onTimeout ? (
                <QuestionCountdown
                  key={`${view.session.total_questions_answered}:${view.question.targetSessionWordId}`}
                  onTimeout={() => onTimeout(view.question)}
                  seconds={timerSeconds}
                />
              ) : null}
              {onToggleTimedMode ? (
                <Button onClick={onToggleTimedMode} size="sm" type="button" variant="ghost">
                  {timedMode ? "Untimed" : "Timed"}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CardTitle className="text-2xl leading-snug sm:text-3xl">
              {view.question.prompt}
            </CardTitle>
            <SpeechButton label="Read question aloud" text={view.question.prompt} />
          </div>
        </CardHeader>
        <CardContent>
          {view.question.answerMode === "typed" ? (
            <TypedAnswerForm
              isPending={isPending}
              onTypedAnswer={(typedAnswer) =>
                onTypedAnswer?.(view.question, typedAnswer)
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {view.question.options.map((option, index) => (
                <Button
                  key={option.vocabWordId}
                  className="h-auto min-h-14 justify-start whitespace-normal px-4 py-3 text-left"
                  disabled={isPending}
                  onClick={() => onAnswer(view.question, option.vocabWordId)}
                  type="button"
                  variant="outline"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed">{option.label}</span>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </StudyStage>
  );
}

function TypedAnswerForm({
  isPending,
  onTypedAnswer,
}: {
  isPending?: boolean;
  onTypedAnswer: (typedAnswer: string) => void;
}) {
  const [typedAnswer, setTypedAnswer] = useState("");
  const trimmedAnswer = typedAnswer.trim();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (trimmedAnswer) {
          onTypedAnswer(trimmedAnswer);
          setTypedAnswer("");
        }
      }}
    >
      <Input
        autoComplete="off"
        autoFocus
        disabled={isPending}
        onChange={(event) => setTypedAnswer(event.target.value)}
        placeholder="Type your answer"
        value={typedAnswer}
      />
      <Button
        className="w-fit"
        disabled={isPending || !trimmedAnswer}
        type="submit"
      >
        Check answer
        <ArrowRight data-icon="inline-end" />
      </Button>
    </form>
  );
}

export function ReviewStartScreen({
  isPending,
  onStart,
  summary,
}: {
  isPending?: boolean;
  onStart: () => void;
  summary: ForeverReviewSummary;
}) {
  const hasWords = summary.eligibleWordCount > 0;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">
          Optional
        </Badge>
        <CardTitle>Forever Review</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="leading-relaxed text-muted-foreground">
          Practice words you&apos;ve already learned.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{summary.eligibleWordCount} learned</Badge>
          {summary.weakCount > 0 ? (
            <Badge variant="outline">{summary.weakCount} weak</Badge>
          ) : null}
          {summary.dueCount > 0 ? (
            <Badge variant="outline">{summary.dueCount} due</Badge>
          ) : null}
          {summary.staleCount > 0 ? (
            <Badge variant="outline">{summary.staleCount} stale</Badge>
          ) : null}
        </div>
      </CardContent>
      <CardFooter>
        <Button disabled={isPending || !hasWords} onClick={onStart} type="button">
          <BookOpenCheck data-icon="inline-start" />
          {isPending ? "Starting..." : "Start Review"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function CorrectionScreen({
  correction,
  isPending,
  onContinue,
  progressContext,
}: {
  correction: CorrectionFeedback;
  isPending?: boolean;
  onContinue: () => void;
  progressContext?: StudyProgressContext;
}) {
  const word = correction.targetWord;
  const handleContinueShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (isPending || event.code !== "Space" || shouldIgnoreStudyShortcut(event)) {
        return;
      }

      event.preventDefault();
      onContinue();
    },
    [isPending, onContinue],
  );

  useStudyKeydown(handleContinueShortcut);

  return (
    <StudyStage progressContext={progressContext}>
      <Card className="w-full">
        <CardHeader>
          <Badge variant="destructive" className="w-fit">
            Incorrect
          </Badge>
          <CardTitle className="text-4xl leading-tight">Not quite</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {correction.answerMode === "multiple_choice" &&
          correction.selectedWord ? (
            <>
              <AnswerContrast
                label="You chose"
                meaning={correction.selectedWord.fast_meaning}
                word={correction.selectedWord.word}
              />
              <Separator />
            </>
          ) : null}
          {correction.answerMode === "typed" && correction.typedAnswer ? (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  You typed
                </p>
                <p className="text-lg leading-relaxed">
                  {correction.typedAnswer}
                </p>
              </div>
              <Separator />
            </>
          ) : null}
          <AnswerContrast
            label="Correct answer"
            meaning={word.vocab_word.fast_meaning}
            word={word.vocab_word.word}
          />
          <Separator />
          <p className="leading-relaxed text-muted-foreground">
            {getPrimaryExampleSentence(word.vocab_word.example_sentence)}
          </p>
        </CardContent>
        <CardFooter>
          <Button disabled={isPending} onClick={onContinue} type="button">
            Continue
            <ArrowRight data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    </StudyStage>
  );
}

export function AnswerReviewScreen({
  isPending,
  onGrade,
  progressContext,
  review,
}: {
  isPending?: boolean;
  onGrade: (grade: AnswerReviewGrade) => void;
  progressContext?: StudyProgressContext;
  review: PendingAnswerReview;
}) {
  const word = review.targetWord;
  const acceptedGrade = review.systemGrade;
  const shouldShowSelectedChoice =
    review.answerMode === "multiple_choice" && Boolean(review.selectedWord);
  const shouldShowCorrectWord =
    review.answerMode === "multiple_choice"
      ? review.selectedVocabWordId !== word.vocab_word_id
      : normalizeAnswerText(review.typedAnswer) !==
        normalizeAnswerText(word.vocab_word.word);
  const shouldShowMeaningOnly = !shouldShowCorrectWord && !shouldShowSelectedChoice;
  const canMarkRight = review.systemGrade !== "correct";
  const canMarkWrong = review.systemGrade !== "incorrect";
  const canMarkUnsure = review.systemGrade !== "incorrect";
  const handleContinueShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (isPending || event.code !== "Space" || shouldIgnoreStudyShortcut(event)) {
        return;
      }

      event.preventDefault();
      onGrade(acceptedGrade);
    },
    [acceptedGrade, isPending, onGrade],
  );

  useStudyKeydown(handleContinueShortcut);

  return (
    <StudyStage progressContext={progressContext}>
      <Card className="w-full">
        <CardHeader>
          <Badge
            variant={getReviewBadgeVariant(review.systemGrade)}
            className={getReviewBadgeClassName(review.systemGrade)}
          >
            {getReviewBadgeText(review.systemGrade)}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Question
            </p>
            <p className="leading-relaxed">{review.question.prompt}</p>
          </div>
          {shouldShowSelectedChoice && review.selectedWord ? (
            <>
              <AnswerReviewChoice
                label="You chose"
                questionType={review.question.questionType}
                word={review.selectedWord}
              />
            </>
          ) : null}
          {review.answerMode === "typed" && review.typedAnswer ? (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  You typed
                </p>
                <p className="text-lg leading-relaxed">{review.typedAnswer}</p>
              </div>
            </>
          ) : null}
          {shouldShowCorrectWord ? (
            <AnswerReviewChoice
              label="Correct answer"
              questionType={review.question.questionType}
              word={word.vocab_word}
            />
          ) : null}
          {shouldShowMeaningOnly ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Meaning
              </p>
              <p className="leading-relaxed text-muted-foreground">
                {word.vocab_word.fast_meaning}
              </p>
            </div>
          ) : null}
        </CardContent>
        <CardFooter>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={isPending}
              onClick={() => onGrade(acceptedGrade)}
              type="button"
            >
              Continue
              <ArrowRight data-icon="inline-end" />
            </Button>
            {canMarkRight ? (
              <Button
                disabled={isPending}
                onClick={() => onGrade("correct")}
                type="button"
                variant="outline"
              >
                <Check data-icon="inline-start" />
                Mark right
              </Button>
            ) : null}
            {canMarkWrong ? (
              <Button
                disabled={isPending}
                onClick={() => onGrade("incorrect")}
                type="button"
                variant="outline"
              >
                <X data-icon="inline-start" />
                Mark wrong
              </Button>
            ) : null}
            {canMarkUnsure ? (
              <Button
                disabled={isPending}
                onClick={() => onGrade("unsure")}
                type="button"
                variant="outline"
              >
                <RotateCcw data-icon="inline-start" />
                Unsure
              </Button>
            ) : null}
          </div>
        </CardFooter>
      </Card>
    </StudyStage>
  );
}

function AnswerContrast({
  label,
  meaning,
  preserveWordCase = false,
  word,
}: {
  label: string;
  meaning: string;
  preserveWordCase?: boolean;
  word: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-col gap-1">
        <p className="text-xl font-semibold leading-snug">
          {preserveWordCase ? word : capitalize(word)}
        </p>
        <p className="leading-relaxed text-muted-foreground">{meaning}</p>
      </div>
    </div>
  );
}

function AnswerReviewChoice({
  label,
  questionType,
  word,
}: {
  label: string;
  questionType: StudyQuestion["questionType"];
  word: SessionWordWithWord["vocab_word"];
}) {
  if (questionType === "meaning_recognition") {
    return (
      <AnswerContrast
        label={label}
        meaning={`Term: ${capitalize(word.word)}`}
        preserveWordCase
        word={word.fast_meaning}
      />
    );
  }

  return (
    <AnswerContrast
      label={label}
      meaning={word.fast_meaning}
      word={word.word}
    />
  );
}

function getReviewBadgeText(grade: AnswerReviewGrade) {
  if (grade === "correct") {
    return "Correct";
  }

  if (grade === "unsure") {
    return "Unsure";
  }

  return "Incorrect";
}

function getReviewBadgeVariant(grade: AnswerReviewGrade) {
  if (grade === "incorrect") {
    return "destructive";
  }

  if (grade === "unsure") {
    return "secondary";
  }

  return "default";
}

function getReviewBadgeClassName(grade: AnswerReviewGrade) {
  if (grade === "correct") {
    return "w-fit border-green-600/20 bg-green-600/10 text-green-700";
  }

  return "w-fit";
}

function normalizeAnswerText(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function useStudyKeydown(onKeyDown: (event: KeyboardEvent) => void) {
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);
}

function shouldIgnoreStudyShortcut(event: KeyboardEvent) {
  return (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isInteractiveShortcutTarget(event.target)
  );
}

function isInteractiveShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }

  return Boolean(
    target.closest(
      [
        "a[href]",
        "button",
        "input",
        "select",
        "textarea",
        "[contenteditable]",
        "[role='button']",
        "[role='checkbox']",
        "[role='combobox']",
        "[role='link']",
        "[role='listbox']",
        "[role='menuitem']",
        "[role='option']",
        "[role='radio']",
        "[role='searchbox']",
        "[role='slider']",
        "[role='spinbutton']",
        "[role='switch']",
        "[role='tab']",
        "[role='textbox']",
      ].join(","),
    ),
  );
}

function getNumberShortcutIndex(event: KeyboardEvent) {
  const digit = getShortcutDigit(event);

  if (digit === null || digit < 1) {
    return null;
  }

  return digit - 1;
}

function getShortcutDigit(event: KeyboardEvent) {
  if (/^[0-9]$/.test(event.key)) {
    return Number(event.key);
  }

  if (/^Digit[0-9]$/.test(event.code)) {
    return Number(event.code.slice(5));
  }

  if (/^Numpad[0-9]$/.test(event.code)) {
    return Number(event.code.slice(6));
  }

  return null;
}

export function DefinitionSelfCheckScreen({
  isPending,
  onGrade,
  progressContext,
  typedAnswer,
  word,
}: {
  isPending?: boolean;
  onGrade: (grade: DefinitionSelfGrade) => void;
  progressContext?: StudyProgressContext;
  typedAnswer: string;
  word: SessionWordWithWord;
}) {
  return (
    <StudyStage progressContext={progressContext}>
      <Card className="w-full">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Check
          </Badge>
          <CardTitle className="text-4xl leading-tight">
            {capitalize(word.vocab_word.word)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              You typed
            </p>
            <p className="text-lg leading-relaxed">{typedAnswer}</p>
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Expected meaning
            </p>
            <p className="text-lg leading-relaxed">
              {word.vocab_word.fast_meaning}
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={isPending}
              onClick={() => onGrade("correct")}
              type="button"
            >
              <Check data-icon="inline-start" />
              I was right
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onGrade("incorrect")}
              type="button"
              variant="outline"
            >
              <X data-icon="inline-start" />
              I was wrong
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onGrade("unsure")}
              type="button"
              variant="outline"
            >
              <RotateCcw data-icon="inline-start" />
              Unsure
            </Button>
          </div>
        </CardFooter>
      </Card>
    </StudyStage>
  );
}

export function GuessCheckScreen({
  isPending,
  onGuess,
  pendingGuess,
  progressContext,
}: {
  isPending?: boolean;
  onGuess: (attemptId: string, confidence: AnswerConfidence) => void;
  pendingGuess: PendingGuess;
  progressContext?: StudyProgressContext;
}) {
  return (
    <StudyStage progressContext={progressContext}>
      <Card className="w-full">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Check
          </Badge>
          <CardTitle className="text-4xl leading-tight">
            {capitalize(pendingGuess.word.word)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg leading-relaxed">
            {pendingGuess.word.fast_meaning}
          </p>
        </CardContent>
        <CardFooter>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={isPending}
              onClick={() => onGuess(pendingGuess.attemptId, "known")}
              type="button"
            >
              <Check data-icon="inline-start" />
              Knew it
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onGuess(pendingGuess.attemptId, "guessed")}
              type="button"
              variant="outline"
            >
              <RotateCcw data-icon="inline-start" />
              Guessed
            </Button>
          </div>
        </CardFooter>
      </Card>
    </StudyStage>
  );
}

export function CompletionScreen({
  onFinish,
  view,
}: {
  onFinish: () => void;
  view: CompleteView;
}) {
  const capped = view.session.completion_reason === "question_cap";

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <Badge variant={capped ? "secondary" : "default"} className="w-fit">
          Complete
        </Badge>
        <CardTitle>
          {capped ? "Practice limit reached." : "Today is recall-ready."}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="New words" value={view.stats.newCount} />
          <Stat label="Reviews cleared" value={view.stats.reviewReadyCount} />
          <Stat
            label="Recall-ready"
            value={`${view.stats.readyCount} / ${view.words.length}`}
          />
        </div>
        {capped && view.stats.weakCarryOverCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {view.stats.weakCarryOverCount} weak{" "}
            {view.stats.weakCarryOverCount === 1 ? "word" : "words"} will lead
            your next review.
          </p>
        ) : null}
        <Separator />
        <div className="flex flex-wrap gap-2">
          {view.words.map((word) => (
            <Badge
              key={word.id}
              variant={word.status === "recall_ready" ? "default" : "outline"}
            >
              {word.vocab_word.word}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={onFinish} type="button">
          Finish
        </Button>
      </CardFooter>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-l pl-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function StudyStage({
  children,
  progressContext,
}: {
  children: ReactNode;
  progressContext?: StudyProgressContext;
}) {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {progressContext ? (
        <StudyProgressHeader progressContext={progressContext} />
      ) : null}
      {children}
    </div>
  );
}

function StudyProgressHeader({
  progressContext,
}: {
  progressContext: StudyProgressContext;
}) {
  if (progressContext.variant === "review") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <Badge variant="secondary">Forever Review</Badge>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {progressContext.reviewedCount} reviewed today
          </Badge>
          <Badge variant="outline">
            {progressContext.unfamiliarCount} unfamiliar
          </Badge>
        </div>
      </div>
    );
  }

  const progress = getStudyProgress(progressContext.words);

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Badge variant="secondary">Recall practice</Badge>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {progressContext.readyCount} recall-ready
          </Badge>
        </div>
      </div>
      <StudyProgressMeter label="Daily mastery" progress={progress} />
    </div>
  );
}

function StudyProgressMeter({
  label,
  progress,
}: {
  label: string;
  progress: StudyProgress;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <span>{progress.percent}%</span>
      </div>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percent}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary shadow-sm transition-[width] duration-500 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
