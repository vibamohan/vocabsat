"use client";

import { ArrowRight, Check, RotateCcw } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { getQuestionTypeLabel } from "@/lib/study/questions";
import type {
  AnswerConfidence,
  PendingGuess,
  StudyQuestion,
  SessionView,
  SessionWordWithWord,
} from "@/lib/study/types";

type LearnView = Extract<SessionView, { screen: "learn" }>;
type QuestionView = Extract<SessionView, { screen: "question" }>;
type CompleteView = Extract<SessionView, { screen: "complete" }>;

const ANSWER_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

export function LearnScreen({
  isPending,
  onContinue,
  view,
}: {
  isPending?: boolean;
  onContinue: () => void;
  view: LearnView;
}) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="secondary">
            Learn {view.currentIndex + 1} of {view.totalWords}
          </Badge>
          <Badge variant="outline">Fast handle</Badge>
        </div>
        <CardTitle className="text-4xl leading-tight">
          {capitalize(view.currentWord.vocab_word.word)}
        </CardTitle>
        <CardDescription>
          Read once, then keep moving. Practice will bring it back.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Fast meaning
          </p>
          <p className="text-lg leading-relaxed">
            {view.currentWord.vocab_word.fast_meaning}
          </p>
        </div>
        <Separator />
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Example
          </p>
          <p className="leading-relaxed text-muted-foreground">
            {view.currentWord.vocab_word.example_sentence}
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button disabled={isPending} onClick={onContinue} type="button">
          Continue
          <ArrowRight data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}

export function QuestionScreen({
  isPending,
  onAnswer,
  view,
}: {
  isPending?: boolean;
  onAnswer: (question: StudyQuestion, selectedVocabWordId: number) => void;
  view: QuestionView;
}) {
  const progress = Math.round((view.readyCount / view.totalWords) * 100);

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="secondary">
            {view.readyCount} of {view.totalWords} recall-ready
          </Badge>
          <Badge variant="outline">
            {view.session.total_questions_answered} / {view.session.question_cap} questions
          </Badge>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>
        <CardDescription>
          {getQuestionTypeLabel(view.question.questionType)}
        </CardDescription>
        <CardTitle className="text-2xl leading-snug">
          {view.question.prompt}
        </CardTitle>
      </CardHeader>
      <CardContent>
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
                {ANSWER_LETTERS[index]}
              </span>
              <span className="leading-relaxed">{option.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function CorrectionScreen({
  isPending,
  onContinue,
  word,
}: {
  isPending?: boolean;
  onContinue: () => void;
  word: SessionWordWithWord;
}) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <Badge variant="destructive" className="w-fit">
          Review
        </Badge>
        <CardTitle>Not quite.</CardTitle>
        <CardDescription>
          This word will return later in the loop.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-3xl font-semibold">
            {capitalize(word.vocab_word.word)}
          </p>
          <p className="text-lg leading-relaxed">
            {word.vocab_word.fast_meaning}
          </p>
        </div>
        <Separator />
        <p className="leading-relaxed text-muted-foreground">
          {word.vocab_word.example_sentence}
        </p>
      </CardContent>
      <CardFooter>
        <Button disabled={isPending} onClick={onContinue} type="button">
          Continue
          <ArrowRight data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}

export function GuessCheckScreen({
  isPending,
  onGuess,
  pendingGuess,
}: {
  isPending?: boolean;
  onGuess: (attemptId: string, confidence: AnswerConfidence) => void;
  pendingGuess: PendingGuess;
}) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">
          Check
        </Badge>
        <CardTitle>Did you know it or guess?</CardTitle>
        <CardDescription>
          {capitalize(pendingGuess.word.word)} only gets SAT usage credit if you
          knew it.
        </CardDescription>
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
    <Card className="max-w-3xl">
      <CardHeader>
        <Badge variant={capped ? "secondary" : "default"} className="w-fit">
          Complete
        </Badge>
        <CardTitle>
          {capped ? "Session complete." : "Today's words are recall-ready."}
        </CardTitle>
        <CardDescription>
          {capped
            ? "The remaining words will lead your next session."
            : "Every word cleared all three recall checks."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Words learned" value={view.stats.learnedCount} />
          <Stat label="Questions" value={view.stats.questionsAnswered} />
          <Stat label="Extra review" value={view.stats.extraReviewCount} />
          <Stat
            label="Recall-ready"
            value={`${view.stats.readyCount} / ${view.words.length}`}
          />
        </div>
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

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
