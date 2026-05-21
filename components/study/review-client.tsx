"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import {
  CorrectionScreen,
  DefinitionSelfCheckScreen,
  GuessCheckScreen,
  QuestionScreen,
  ReviewCheckpointScreen,
  ReviewStartScreen,
} from "@/components/study/session-screens";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCurrentUser,
  getForeverReviewSummary,
  getForeverReviewView,
  recordForeverReviewGuess,
  submitForeverReviewAnswer,
} from "@/lib/study/client-session";
import { FOREVER_REVIEW_CHECKPOINT_INTERVAL } from "@/lib/study/config";
import { gradeTypedAnswer } from "@/lib/study/questions";
import {
  applyOptimisticForeverReviewAnswer,
  applyOptimisticForeverReviewTypedAnswer,
  applyOptimisticForeverReviewGuess,
} from "@/lib/study/optimistic-session";
import type {
  AnswerConfidence,
  CorrectionFeedback,
  DefinitionSelfGrade,
  ForeverReviewSummary,
  ForeverReviewView,
  PendingGuess,
  SessionWordWithWord,
  StudyQuestion,
} from "@/lib/study/types";
import { createClient } from "@/lib/supabase/client";

type ReviewMode =
  | { type: "start" }
  | { type: "normal" }
  | { type: "correction"; correction: CorrectionFeedback }
  | {
      type: "definition_check";
      question: StudyQuestion;
      typedAnswer: string;
      word: SessionWordWithWord;
    }
  | { type: "guess"; pendingGuess: PendingGuess }
  | { type: "checkpoint" };

export function ReviewClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [mode, setMode] = useState<ReviewMode>({ type: "start" });
  const [summary, setSummary] = useState<ForeverReviewSummary | null>(null);
  const [user, setUser] = useState<{ email?: string | null; id: string } | null>(
    null,
  );
  const [view, setView] = useState<ForeverReviewView | null>(null);
  const dismissedCheckpointRef = useRef<number | null>(null);
  const handledGuessAttemptIdsRef = useRef<Set<string>>(new Set());
  const handledQuestionKeyRef = useRef<string | null>(null);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceVersionRef = useRef(0);

  const shouldShowCheckpoint = useCallback((nextView: ForeverReviewView) => {
    const answered = nextView.session.total_questions_answered;

    return (
      answered > 0 &&
      answered % FOREVER_REVIEW_CHECKPOINT_INTERVAL === 0 &&
      dismissedCheckpointRef.current !== answered
    );
  }, []);

  const refreshView = useCallback(async () => {
    if (!user) {
      return;
    }

    const nextView = await getForeverReviewView(supabase, user.id);

    setView(nextView);
    setMode(shouldShowCheckpoint(nextView) ? { type: "checkpoint" } : { type: "normal" });
  }, [shouldShowCheckpoint, supabase, user]);

  const enqueuePersistence = useCallback(
    (operation: () => Promise<void>, fallbackMessage: string) => {
      const version = persistenceVersionRef.current;
      const queuedOperation = persistenceQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (version !== persistenceVersionRef.current) {
            return;
          }

          await operation();
        })
        .catch(async (caughtError) => {
          if (version !== persistenceVersionRef.current) {
            return;
          }

          persistenceVersionRef.current += 1;
          handledGuessAttemptIdsRef.current.clear();
          handledQuestionKeyRef.current = null;
          setError(getErrorMessage(caughtError, fallbackMessage));

          try {
            await refreshView();
          } catch (refreshError) {
            setError(
              getErrorMessage(refreshError, "Unable to reload the review."),
            );
          }
        });

      persistenceQueueRef.current = queuedOperation;
    },
    [refreshView],
  );

  const loadStart = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const currentUser = await getCurrentUser(supabase);

      if (!currentUser) {
        router.replace("/auth/login");
        return;
      }

      setUser(currentUser);
      setSummary(await getForeverReviewSummary(supabase, currentUser.id));
      setMode({ type: "start" });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to load review."));
    } finally {
      setIsLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadStart();
  }, [loadStart]);

  const handleStart = async () => {
    if (!user) {
      return;
    }

    setError(null);
    setIsPending(true);
    dismissedCheckpointRef.current = null;

    try {
      const nextView = await getForeverReviewView(supabase, user.id);

      setView(nextView);
      setMode(shouldShowCheckpoint(nextView) ? { type: "checkpoint" } : { type: "normal" });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to start review."));
    } finally {
      setIsPending(false);
    }
  };

  const handleAnswer = (
    question: StudyQuestion,
    selectedVocabWordId: number,
  ) => {
    if (!user || !view || mode.type !== "normal") {
      return;
    }

    setError(null);

    const questionKey = [
      view.session.id,
      view.session.total_questions_answered,
      question.targetSessionWordId,
      question.questionType,
    ].join(":");

    if (handledQuestionKeyRef.current === questionKey) {
      return;
    }

    handledQuestionKeyRef.current = questionKey;

    const attemptId = crypto.randomUUID();
    const answeredAt = new Date().toISOString();

    try {
      const result = applyOptimisticForeverReviewAnswer(
        view,
        question,
        selectedVocabWordId,
        attemptId,
        answeredAt,
      );

      setView(result.nextView);

      if (result.correction) {
        setMode({ type: "correction", correction: result.correction });
      } else if (result.pendingGuess) {
        setMode({ type: "guess", pendingGuess: result.pendingGuess });
      } else if (shouldShowCheckpoint(result.nextView)) {
        setMode({ type: "checkpoint" });
      } else {
        setMode({ type: "normal" });
      }
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to check the answer."));
      handledQuestionKeyRef.current = null;
      return;
    }

    enqueuePersistence(
      async () => {
        await submitForeverReviewAnswer(supabase, user.id, {
          attemptId,
          questionType: question.questionType,
          selectedVocabWordId,
          sessionWordId: question.targetSessionWordId,
        });
      },
      "Unable to save the review answer.",
    );
  };

  const handleTypedAnswer = (
    question: StudyQuestion,
    typedAnswer: string,
  ) => {
    if (!user || !view || mode.type !== "normal") {
      return;
    }

    const targetWord = view.words.find(
      (word) => word.id === question.targetSessionWordId,
    );

    if (!targetWord) {
      setError("Unable to find the active word.");
      return;
    }

    if (
      question.questionType === "definition_recall" &&
      gradeTypedAnswer(question.questionType, targetWord.vocab_word, typedAnswer) !==
        "correct"
    ) {
      setMode({
        type: "definition_check",
        question,
        typedAnswer,
        word: targetWord,
      });
      return;
    }

    submitTypedAnswer(question, typedAnswer);
  };

  const submitTypedAnswer = (
    question: StudyQuestion,
    typedAnswer: string,
    selfGrade?: DefinitionSelfGrade,
  ) => {
    if (!user || !view) {
      return;
    }

    setError(null);

    const questionKey = [
      view.session.id,
      view.session.total_questions_answered,
      question.targetSessionWordId,
      question.questionType,
    ].join(":");

    if (handledQuestionKeyRef.current === questionKey) {
      return;
    }

    handledQuestionKeyRef.current = questionKey;

    const attemptId = crypto.randomUUID();
    const answeredAt = new Date().toISOString();

    try {
      const result = applyOptimisticForeverReviewTypedAnswer(
        view,
        question,
        typedAnswer,
        answeredAt,
        selfGrade,
      );

      setView(result.nextView);

      if (result.correction) {
        setMode({ type: "correction", correction: result.correction });
      } else if (shouldShowCheckpoint(result.nextView)) {
        setMode({ type: "checkpoint" });
      } else {
        setMode({ type: "normal" });
      }
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to check the answer."));
      handledQuestionKeyRef.current = null;
      return;
    }

    enqueuePersistence(
      async () => {
        await submitForeverReviewAnswer(supabase, user.id, {
          attemptId,
          questionType: question.questionType,
          selfGrade,
          sessionWordId: question.targetSessionWordId,
          typedAnswer,
        });
      },
      "Unable to save the review answer.",
    );
  };

  const handleCorrectionContinue = () => {
    if (view && shouldShowCheckpoint(view)) {
      setMode({ type: "checkpoint" });
      return;
    }

    setMode({ type: "normal" });
  };

  const handleGuess = (attemptId: string, confidence: AnswerConfidence) => {
    if (!user || !view || mode.type !== "guess") {
      return;
    }

    if (handledGuessAttemptIdsRef.current.has(attemptId)) {
      return;
    }

    handledGuessAttemptIdsRef.current.add(attemptId);
    setError(null);

    try {
      const nextView = applyOptimisticForeverReviewGuess(
        view,
        mode.pendingGuess,
        confidence,
        new Date().toISOString(),
      );

      setView(nextView);
      setMode(shouldShowCheckpoint(nextView) ? { type: "checkpoint" } : { type: "normal" });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to save the guess check."));
      handledGuessAttemptIdsRef.current.delete(attemptId);
      return;
    }

    enqueuePersistence(
      () => recordForeverReviewGuess(supabase, user.id, attemptId, confidence),
      "Unable to save the review guess check.",
    );
  };

  const handleCheckpointContinue = () => {
    if (view) {
      dismissedCheckpointRef.current = view.session.total_questions_answered;
    }

    setMode({ type: "normal" });
  };

  return (
    <StudyAppShell
      actions={
        <Button
          onClick={() => router.push("/dashboard")}
          size="sm"
          type="button"
          variant="outline"
        >
          <ArrowLeft data-icon="inline-start" />
          Home
        </Button>
      }
    >
      {error ? <p className="max-w-2xl text-sm text-destructive">{error}</p> : null}

      {isLoading || !summary ? (
        <div className="flex max-w-3xl flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {!isLoading && summary && mode.type === "start" ? (
        <ReviewStartScreen
          isPending={isPending}
          onStart={handleStart}
          summary={summary}
        />
      ) : null}

      {!isLoading && view && mode.type === "normal" ? (
        <QuestionScreen
          isPending={isPending}
          onAnswer={handleAnswer}
          onTypedAnswer={handleTypedAnswer}
          variant="review"
          view={view}
        />
      ) : null}

      {!isLoading && mode.type === "correction" ? (
        <CorrectionScreen
          correction={mode.correction}
          isPending={isPending}
          onContinue={handleCorrectionContinue}
          progressContext={
            view
              ? {
                  readyCount: view.readyCount,
                  strengthenedCount: view.checkpoint.strengthenedCount,
                  variant: "review",
                  words: view.words,
                }
              : undefined
          }
        />
      ) : null}

      {!isLoading && mode.type === "definition_check" ? (
        <DefinitionSelfCheckScreen
          isPending={isPending}
          onGrade={(grade) =>
            submitTypedAnswer(mode.question, mode.typedAnswer, grade)
          }
          progressContext={
            view
              ? {
                  readyCount: view.readyCount,
                  strengthenedCount: view.checkpoint.strengthenedCount,
                  variant: "review",
                  words: view.words,
                }
              : undefined
          }
          typedAnswer={mode.typedAnswer}
          word={mode.word}
        />
      ) : null}

      {!isLoading && mode.type === "guess" ? (
        <GuessCheckScreen
          isPending={isPending}
          onGuess={handleGuess}
          pendingGuess={mode.pendingGuess}
          progressContext={
            view
              ? {
                  readyCount: view.readyCount,
                  strengthenedCount: view.checkpoint.strengthenedCount,
                  variant: "review",
                  words: view.words,
                }
              : undefined
          }
        />
      ) : null}

      {!isLoading && view && mode.type === "checkpoint" ? (
        <ReviewCheckpointScreen
          checkpoint={view.checkpoint}
          isPending={isPending}
          onContinue={handleCheckpointContinue}
          onStop={() => router.push("/dashboard")}
        />
      ) : null}
    </StudyAppShell>
  );
}

function getErrorMessage(caughtError: unknown, fallbackMessage: string) {
  if (caughtError instanceof Error) {
    return `${fallbackMessage} ${caughtError.message}`;
  }

  return fallbackMessage;
}
