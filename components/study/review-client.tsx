"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import {
  AnswerReviewScreen,
  QuestionScreen,
  ReviewStartScreen,
} from "@/components/study/session-screens";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCurrentUser,
  getForeverReviewSummary,
  getForeverReviewView,
  submitForeverReviewAnswer,
} from "@/lib/study/client-session";
import {
  applyOptimisticForeverReviewAnswerReview,
  buildMultipleChoiceAnswerReview,
  buildTypedAnswerReview,
} from "@/lib/study/optimistic-session";
import type {
  AnswerReviewGrade,
  ForeverReviewSummary,
  ForeverReviewView,
  PendingAnswerReview,
  StudyQuestion,
} from "@/lib/study/types";
import { createClient } from "@/lib/supabase/client";

type ReviewMode =
  | { type: "start" }
  | { type: "normal" }
  | {
      type: "answer_review";
      review: PendingAnswerReview;
      sourceView: ForeverReviewView;
    };

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
  const handledQuestionKeyRef = useRef<string | null>(null);
  const handledReviewAttemptIdsRef = useRef<Set<string>>(new Set());
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceVersionRef = useRef(0);

  const refreshView = useCallback(async () => {
    if (!user) {
      return;
    }

    const nextView = await getForeverReviewView(supabase, user.id);

    setView(nextView);
    setMode({ type: "normal" });
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

    try {
      const nextView = await getForeverReviewView(supabase, user.id);

      setView(nextView);
      setMode({ type: "normal" });
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

    try {
      const review = buildMultipleChoiceAnswerReview(
        view,
        question,
        selectedVocabWordId,
        attemptId,
      );

      setMode({ type: "answer_review", review, sourceView: view });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to check the answer."));
      handledQuestionKeyRef.current = null;
      return;
    }
  };

  const handleTypedAnswer = (
    question: StudyQuestion,
    typedAnswer: string,
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

    try {
      const review = buildTypedAnswerReview(
        view,
        question,
        typedAnswer,
        attemptId,
      );

      setMode({ type: "answer_review", review, sourceView: view });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to check the answer."));
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
      const result = applyOptimisticForeverReviewAnswerReview(
        mode.sourceView,
        mode.review,
        grade,
        new Date().toISOString(),
      );

      setView(result.nextView);
      setMode({ type: "normal" });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to check the answer."));
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

          await submitForeverReviewAnswer(supabase, user.id, {
            attemptId: mode.review.attemptId,
            questionType: mode.review.question.questionType,
            reviewGrade: grade,
            selectedVocabWordId,
            sessionWordId: mode.review.question.targetSessionWordId,
          });
          return;
        }

        await submitForeverReviewAnswer(supabase, user.id, {
          attemptId: mode.review.attemptId,
          questionType: mode.review.question.questionType,
          reviewGrade: grade,
          sessionWordId: mode.review.question.targetSessionWordId,
          typedAnswer: mode.review.typedAnswer ?? "",
        });
      },
      "Unable to save the review answer.",
    );
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

      {!isLoading && mode.type === "answer_review" ? (
        <AnswerReviewScreen
          isPending={isPending}
          onGrade={handleReviewGrade}
          progressContext={{
            reviewedCount: mode.sourceView.session.total_questions_answered,
            unfamiliarCount: mode.sourceView.checkpoint.weakWordsFound,
            variant: "review",
          }}
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
