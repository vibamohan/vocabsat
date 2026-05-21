"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import {
  CompletionScreen,
  CorrectionScreen,
  DefinitionSelfCheckScreen,
  GuessCheckScreen,
  LearnScreen,
  QuestionScreen,
} from "@/components/study/session-screens";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  advanceLearn,
  getCurrentUser,
  getSessionView,
  recordGuess,
  replaceKnownLearnWord,
  resetTodaySession,
  submitAnswer,
} from "@/lib/study/client-session";
import { gradeTypedAnswer } from "@/lib/study/questions";
import {
  applyOptimisticAnswer,
  applyOptimisticTypedAnswer,
  applyOptimisticGuess,
} from "@/lib/study/optimistic-session";
import type {
  AnswerConfidence,
  CorrectionFeedback,
  DefinitionSelfGrade,
  PendingGuess,
  SessionView,
  SessionWordWithWord,
  StudyQuestion,
} from "@/lib/study/types";
import { createClient } from "@/lib/supabase/client";

type SessionMode =
  | { type: "normal" }
  | { type: "correction"; correction: CorrectionFeedback }
  | {
      type: "definition_check";
      question: StudyQuestion;
      typedAnswer: string;
      word: SessionWordWithWord;
    }
  | { type: "guess"; pendingGuess: PendingGuess };

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
  const handledGuessAttemptIdsRef = useRef<Set<string>>(new Set());
  const handledQuestionKeyRef = useRef<string | null>(null);
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
          handledGuessAttemptIdsRef.current.clear();
          handledQuestionKeyRef.current = null;
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
    const answeredAt = new Date().toISOString();

    try {
      const result = applyOptimisticAnswer(
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
      } else {
        setMode({ type: "normal" });
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to check the answer.",
      );
      handledQuestionKeyRef.current = null;
      return;
    }

    enqueuePersistence(
      async () => {
        await submitAnswer(supabase, user.id, {
          attemptId,
          questionType: question.questionType,
          selectedVocabWordId,
          sessionWordId: question.targetSessionWordId,
        });
      },
      "Unable to save the answer.",
    );
  };

  const handleTypedAnswer = (
    question: StudyQuestion,
    typedAnswer: string,
  ) => {
    if (!user || !view || view.screen !== "question") {
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
    const answeredAt = new Date().toISOString();

    try {
      const result = applyOptimisticTypedAnswer(
        view,
        question,
        typedAnswer,
        answeredAt,
        selfGrade,
      );

      setView(result.nextView);
      setMode(
        result.correction
          ? { type: "correction", correction: result.correction }
          : { type: "normal" },
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to check the answer.",
      );
      handledQuestionKeyRef.current = null;
      return;
    }

    enqueuePersistence(
      async () => {
        await submitAnswer(supabase, user.id, {
          attemptId,
          questionType: question.questionType,
          selfGrade,
          sessionWordId: question.targetSessionWordId,
          typedAnswer,
        });
      },
      "Unable to save the answer.",
    );
  };

  const handleCorrectionContinue = () => {
    setMode({ type: "normal" });
  };

  const handleGuess = (attemptId: string, confidence: AnswerConfidence) => {
    if (!user || !view || view.screen !== "question" || mode.type !== "guess") {
      return;
    }

    if (handledGuessAttemptIdsRef.current.has(attemptId)) {
      return;
    }

    handledGuessAttemptIdsRef.current.add(attemptId);
    setError(null);

    try {
      setView(
        applyOptimisticGuess(
          view,
          mode.pendingGuess,
          confidence,
          new Date().toISOString(),
        ),
      );
      setMode({ type: "normal" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to check the guess.",
      );
      handledGuessAttemptIdsRef.current.delete(attemptId);
      return;
    }

    enqueuePersistence(
      () => recordGuess(supabase, user.id, attemptId, confidence),
      "Unable to save the guess check.",
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
    handledGuessAttemptIdsRef.current.clear();
    handledQuestionKeyRef.current = null;

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

      {!isLoading && mode.type === "correction" ? (
        <CorrectionScreen
          correction={mode.correction}
          isPending={isPending}
          onContinue={handleCorrectionContinue}
          progressContext={
            view?.screen === "question"
              ? {
                  readyCount: view.readyCount,
                  variant: "daily",
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
            view?.screen === "question"
              ? {
                  readyCount: view.readyCount,
                  variant: "daily",
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
            view?.screen === "question"
              ? {
                  readyCount: view.readyCount,
                  variant: "daily",
                  words: view.words,
                }
              : undefined
          }
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
