"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import { TodaySessionCard } from "@/components/study/today-session-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCurrentUser,
  getTodaySessionSummary,
  resetTodaySession,
  startOrContinueTodaySession,
} from "@/lib/study/client-session";
import type { TodaySessionSummary } from "@/lib/study/types";
import { createClient } from "@/lib/supabase/client";

export function DashboardClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [summary, setSummary] = useState<TodaySessionSummary | null>(null);
  const [user, setUser] = useState<{ email?: string | null; id: string } | null>(
    null,
  );

  const loadDashboard = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const currentUser = await getCurrentUser(supabase);

      if (!currentUser) {
        router.replace("/auth/login");
        return;
      }

      setUser(currentUser);
      setSummary(await getTodaySessionSummary(supabase, currentUser.id));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load today's session.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleStart = async () => {
    if (!user) {
      return;
    }

    setError(null);
    setIsBusy(true);

    try {
      await startOrContinueTodaySession(supabase, user.id);
      router.push("/session");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to start today's session.",
      );
      setIsBusy(false);
    }
  };

  const handleReset = async () => {
    if (!user || !summary?.hasSession) {
      return;
    }

    const confirmed = window.confirm(
      "Reset today's session? This clears today's answers and starts the same word set over.",
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setIsResetting(true);

    try {
      await resetTodaySession(supabase, user.id);
      setSummary(await getTodaySessionSummary(supabase, user.id));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to reset today's session.",
      );
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <StudyAppShell>
      <section className="flex w-full max-w-xl flex-col gap-4">
        {error ? (
          <p className="max-w-xl text-sm text-destructive">{error}</p>
        ) : null}

        {isLoading || !summary ? (
          <Skeleton className="h-56 max-w-xl" />
        ) : (
          <TodaySessionCard
            isBusy={isBusy}
            isResetting={isResetting}
            onReset={summary.hasSession ? handleReset : undefined}
            onStart={handleStart}
            summary={summary}
          />
        )}
      </section>
    </StudyAppShell>
  );
}
