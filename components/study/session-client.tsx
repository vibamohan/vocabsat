"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import {
  AnswerReviewScreen,
  CompletionScreen,
  LearnScreen,
  QuestionScreen,
} from "@/components/study/session-screens";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  advanceLearn,
  getCurrentUser,
  getSessionView,
  replaceKnownLearnWord,
  resetTodaySession,
  submitAnswer,
} from "@/lib/study/client-session";
import {
  applyOptimisticAnswerReview,
  buildMultipleChoiceAnswerReview,
  buildTypedAnswerReview,
} from "@/lib/study/optimistic-session";
import type {
  AnswerReviewGrade,
  PendingAnswerReview,
  SessionView,
  StudyQuestion,
} from "@/lib/study/types";
import { createClient } from "@/lib/supabase/client";

type QuestionView = Extract<SessionView, { screen: "question" }>;

type SessionMode =
  | { type: "normal" }
  | {
      type: "answer_review";
      review: PendingAnswerReview;
      sourceView: QuestionView;
    };

export function SessionClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [mode, setMode] = useState<SessionMode>({ type: "normal" });
  const [user, setUser] = useState<{ email?: string | null; id: string } | null>(
    null,
  );
  const [view, setView] = useState<SessionView | null>(null);
  const handledQuestionKeyRef = useRef<string | null>(null);
  const handledReviewAttemptIdsRef = useRef<Set<string>>(new Set());
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceVersionRef = useRef(0);

  const refreshView = useCallback(async () => {
    if (!user) {
      return;
    }

    setView(await getSessionView(supabase, user.id));
  }, [supabase, user]);

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
          handledQuestionKeyRef.current = null;
          handledReviewAttemptIdsRef.current.clear();
          setMode({ type: "normal" });
          setError(getErrorMessage(caughtError, fallbackMessage));

          try {
            await refreshView();
          } catch (refreshError) {
            setError(
              getErrorMessage(refreshError, "Unable to reload the session."),
            );
          }
        });

      persistenceQueueRef.current = queuedOperation;
    },
    [refreshView],
  );

  const loadView = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const currentUser = await getCurrentUser(supabase);

      if (!currentUser) {
        router.replace("/auth/login");
        return;
      }

      setUser(currentUser);
      setMode({ type: "normal" });
      setView(await getSessionView(supabase, currentUser.id));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load the session.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadView();
  }, [loadView]);

  const handleLearnContinue = async () => {
    if (!user || !view || view.screen !== "learn") {
      return;
    }

    setError(null);
    setIsPending(true);

    const nextIndex = view.currentIndex + 1;
    const hasNextLearnCard = nextIndex < view.totalWords;

    if (hasNextLearnCard) {
      setView({
        ...view,
        currentIndex: nextIndex,
        currentWord: view.learnWords[nextIndex],
        session: {
          ...view.session,
          learn_index: nextIndex,
        },
      });
    }

    try {
      await advanceLearn(supabase, user.id, view.session, view.words);

      if (!hasNextLearnCard) {
        await refreshView();
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save progress.",
      );
      await refreshView();
    } finally {
      setIsPending(false);
    }
  };

  const handleReplaceKnownWord = async () => {
    if (!user || !view || view.screen !== "learn") {
      return;
    }

    setError(null);
    setIsPending(true);

    try {
      setView(
        await replaceKnownLearnWord(
          supabase,
          user.id,
          view.session.id,
          view.currentWord.id,
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to replace the word.",
      );
      await refreshView();
    } finally {
      setIsPending(false);
    }
  };

  const handleAnswer = (
    question: StudyQuestion,
    selectedVocabWordId: number,
  ) => {
    if (!user || !view || view.screen !== "question") {
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

    try {
      const review = buildMultipleChoiceAnswerReview(
        view,
        question,
        selectedVocabWordId,
        attemptId,
      );

      setMode({ type: "answer_review", review, sourceView: view });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to check the answer.",
      );
      handledQuestionKeyRef.current = null;
      return;
    }
  };

  const handleTypedAnswer = (
    question: StudyQuestion,
    typedAnswer: string,
  ) => {
    if (!user || !view || view.screen !== "question") {
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

    try {
      const review = buildTypedAnswerReview(
        view,
        question,
        typedAnswer,
        attemptId,
      );

      setMode({ type: "answer_review", review, sourceView: view });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to check the answer.",
      );
      handledQuestionKeyRef.current = null;
      return;
    }
  };

  const handleReviewGrade = (grade: AnswerReviewGrade) => {
    if (!user || mode.type !== "answer_review") {
      return;
    }

    if (handledReviewAttemptIdsRef.current.has(mode.review.attemptId)) {
      return;
    }

    handledReviewAttemptIdsRef.current.add(mode.review.attemptId);
    setError(null);

    try {
      const result = applyOptimisticAnswerReview(
        mode.sourceView,
        mode.review,
        grade,
        new Date().toISOString(),
      );
      setView(result.nextView);
      setMode({ type: "normal" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to check the answer.",
      );
      handledQuestionKeyRef.current = null;
      handledReviewAttemptIdsRef.current.delete(mode.review.attemptId);
      return;
    }

    enqueuePersistence(
      async () => {
        if (mode.review.answerMode === "multiple_choice") {
          const selectedVocabWordId = mode.review.selectedVocabWordId;

          if (!selectedVocabWordId) {
            throw new Error("Unable to find the selected answer.");
          }

          await submitAnswer(supabase, user.id, {
            attemptId: mode.review.attemptId,
            questionType: mode.review.question.questionType,
            reviewGrade: grade,
            selectedVocabWordId,
            sessionWordId: mode.review.question.targetSessionWordId,
          });
          return;
        }

        await submitAnswer(supabase, user.id, {
          attemptId: mode.review.attemptId,
          questionType: mode.review.question.questionType,
          reviewGrade: grade,
          sessionWordId: mode.review.question.targetSessionWordId,
          typedAnswer: mode.review.typedAnswer ?? "",
        });
      },
      "Unable to save the answer.",
    );
  };

  const handleReset = async () => {
    if (!user) {
      return;
    }

    const confirmed = window.confirm(
      "Reset today's session? This clears today's answers and starts the same word set over.",
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setIsPending(true);
    setMode({ type: "normal" });
    persistenceVersionRef.current += 1;
    handledQuestionKeyRef.current = null;
    handledReviewAttemptIdsRef.current.clear();

    try {
      await resetTodaySession(supabase, user.id);
      setView(await getSessionView(supabase, user.id));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to reset today's session.",
      );
      await refreshView();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <StudyAppShell
      actions={
        view ? (
          <Button
            disabled={isPending}
            onClick={handleReset}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw data-icon="inline-start" />
            Reset
          </Button>
        ) : null
      }
    >
      {error ? <p className="max-w-2xl text-sm text-destructive">{error}</p> : null}

      {isLoading || !view ? (
        <div className="flex max-w-3xl flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {!isLoading && view && mode.type === "normal" ? (
        <>
          {view.screen === "learn" ? (
            <LearnScreen
              isPending={isPending}
              onContinue={handleLearnContinue}
              onReplaceKnown={handleReplaceKnownWord}
              view={view}
            />
          ) : null}
          {view.screen === "question" ? (
            <QuestionScreen
              isPending={isPending}
              onAnswer={handleAnswer}
              onTypedAnswer={handleTypedAnswer}
              view={view}
            />
          ) : null}
          {view.screen === "complete" ? (
            <CompletionScreen
              onFinish={() => router.push("/dashboard")}
              view={view}
            />
          ) : null}
        </>
      ) : null}

      {!isLoading && mode.type === "answer_review" ? (
        <AnswerReviewScreen
          isPending={isPending}
          onGrade={handleReviewGrade}
          progressContext={
            mode.sourceView.screen === "question"
              ? {
                  readyCount: mode.sourceView.readyCount,
                  variant: "daily",
                  words: mode.sourceView.words,
                }
              : undefined
          }
          review={mode.review}
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
