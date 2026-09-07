"use client";

import { useEffect, useMemo, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatResponseTime,
  formatStudyDuration,
  formatStudyPercent,
  type StudyAnalytics,
} from "@/lib/study/analytics";
import { getQuestionTypeLabel } from "@/lib/study/questions";
import type { QuestionType } from "@/lib/study/types";
import { createClient } from "@/lib/supabase/client";

const WINDOWS = [7, 30, 0] as const;

export function ProgressClient() {
  const supabase = useMemo(() => createClient(), []);
  const [analytics, setAnalytics] = useState<StudyAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);

  useEffect(() => {
    let active = true;
    setAnalytics(null);
    setError(null);

    void supabase.rpc("get_study_analytics", { window_days: windowDays }).then(({ data, error: rpcError }) => {
      if (!active) return;
      if (rpcError) {
        setError("Unable to load study analytics.");
        return;
      }
      setAnalytics(data as StudyAnalytics);
    });

    return () => {
      active = false;
    };
  }, [supabase, windowDays]);

  return (
    <StudyAppShell>
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Learning signals</p>
            <h1 className="text-3xl font-semibold tracking-tight">Progress</h1>
          </div>
          <div className="flex gap-2">
            {WINDOWS.map((days) => (
              <Button key={days} onClick={() => setWindowDays(days)} size="sm" type="button" variant={windowDays === days ? "default" : "outline"}>
                {days === 0 ? "All" : `${days}d`}
              </Button>
            ))}
          </div>
        </div>

        {analytics ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Accuracy" value={formatStudyPercent(analytics.accuracy)} />
              <Metric label="Review retention" value={formatStudyPercent(analytics.reviewRetention)} />
              <Metric label="Median response" value={formatResponseTime(analytics.medianResponseTimeMs)} />
              <Metric label="Active study" value={formatStudyDuration(analytics.activeTimeMs)} />
            </div>
            <Card>
              <CardHeader><CardTitle>By question type</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                {analytics.byQuestionType.length ? analytics.byQuestionType.map((row) => (
                  <div key={row.question_type} className="grid grid-cols-[1fr_auto_auto] gap-4 border-b py-3 text-sm last:border-0">
                    <span>{getQuestionTypeLabel(row.question_type as QuestionType)}</span>
                    <span className="text-muted-foreground">{row.correct}/{row.attempts}</span>
                    <span className="w-12 text-right">{formatResponseTime(row.median_response_time_ms)}</span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">Answer questions to build your progress view.</p>}
              </CardContent>
            </Card>
          </>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </StudyAppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
