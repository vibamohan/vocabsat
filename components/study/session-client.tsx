"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import {
  CompletionScreen,
  CorrectionScreen,
  GuessCheckScreen,
  LearnScreen,
  QuestionScreen,
} from "@/components/study/session-screens";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  advanceLearn,
  getCurrentUser,
  getPendingGuess,
  getSessionView,
  recordGuess,
  resetTodaySession,
  submitAnswer,
} from "@/lib/study/client-session";
import type {
  AnswerConfidence,
  PendingGuess,
  SessionView,
  SessionWordWithWord,
  StudyQuestion,
} from "@/lib/study/types";
import { createClient } from "@/lib/supabase/client";

type SessionMode =
  | { type: "normal" }
  | { type: "correction"; word: SessionWordWithWord }
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

  const refreshView = async () => {
    if (!user) {
      return;
    }

    setView(await getSessionView(supabase, user.id));
  };

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
        currentWord: view.words[nextIndex],
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

  const handleAnswer = async (
    question: StudyQuestion,
    selectedVocabWordId: number,
  ) => {
    if (!user || !view || view.screen !== "question") {
      return;
    }

    setError(null);
    setIsPending(true);

    try {
      const result = await submitAnswer(supabase, user.id, {
        questionType: question.questionType,
        selectedVocabWordId,
        sessionWordId: question.targetSessionWordId,
      });

      if (result.outcome === "incorrect") {
        const word = view.words.find(
          (sessionWord) => sessionWord.id === result.sessionWordId,
        );

        if (!word) {
          await refreshView();
          return;
        }

        setMode({ type: "correction", word });
        return;
      }

      if (result.outcome === "guess_check") {
        const pendingGuess = await getPendingGuess(
          supabase,
          user.id,
          result.attemptId,
        );

        if (pendingGuess) {
          setMode({ type: "guess", pendingGuess });
          return;
        }
      }

      await refreshView();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save the answer.",
      );
      await refreshView();
    } finally {
      setIsPending(false);
    }
  };

  const handleCorrectionContinue = async () => {
    setMode({ type: "normal" });
    setIsPending(true);

    try {
      await refreshView();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to continue the session.",
      );
    } finally {
      setIsPending(false);
    }
  };

  const handleGuess = async (
    attemptId: string,
    confidence: AnswerConfidence,
  ) => {
    if (!user) {
      return;
    }

    setError(null);
    setIsPending(true);

    try {
      await recordGuess(supabase, user.id, attemptId, confidence);
      setMode({ type: "normal" });
      await refreshView();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save the guess check.",
      );
    } finally {
      setIsPending(false);
    }
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
      userEmail={user?.email}
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
              view={view}
            />
          ) : null}
          {view.screen === "question" ? (
            <QuestionScreen
              isPending={isPending}
              onAnswer={handleAnswer}
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
          isPending={isPending}
          onContinue={handleCorrectionContinue}
          word={mode.word}
        />
      ) : null}

      {!isLoading && mode.type === "guess" ? (
        <GuessCheckScreen
          isPending={isPending}
          onGuess={handleGuess}
          pendingGuess={mode.pendingGuess}
        />
      ) : null}
    </StudyAppShell>
  );
}
