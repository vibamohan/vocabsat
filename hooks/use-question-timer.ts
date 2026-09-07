"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  createQuestionTimer,
  type QuestionTimingResult,
} from "@/lib/study/timing";

export function useQuestionTimer(questionKey: string | null) {
  const timerRef = useRef<ReturnType<typeof createQuestionTimer> | null>(null);

  useEffect(() => {
    timerRef.current = questionKey ? createQuestionTimer() : null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        timerRef.current?.pause();
      } else {
        timerRef.current?.resume();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      timerRef.current?.pause();
    };
  }, [questionKey]);

  return useCallback((): QuestionTimingResult | undefined => {
    return timerRef.current?.finish();
  }, []);
}
