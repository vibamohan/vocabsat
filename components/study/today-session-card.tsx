"use client";

import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TodaySessionSummary } from "@/lib/study/types";

type TodaySessionCardProps = {
  isBusy?: boolean;
  isResetting?: boolean;
  onStart: () => void;
  onReset?: () => void;
  summary: TodaySessionSummary;
};

type ActiveSessionPhase = Extract<
  TodaySessionSummary,
  { hasSession: true }
>["phase"];

export function TodaySessionCard({
  isBusy = false,
  isResetting = false,
  onStart,
  onReset,
  summary,
}: TodaySessionCardProps) {
  if (
    !summary.hasSession &&
    summary.availableWordCount < summary.dailyWordCount &&
    summary.dueReviewCount === 0
  ) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Word bank</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="outline">
            {summary.availableWordCount} / {summary.dailyWordCount} words
          </Badge>
        </CardContent>
        <CardFooter>
          <Button disabled type="button">
            Start
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!summary.hasSession && summary.newWordCount + summary.dueReviewCount === 0) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Caught up</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No new or review words are due today.
          </p>
        </CardContent>
        <CardFooter>
          <Button disabled type="button">
            Start
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!summary.hasSession) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Today</CardTitle>
            <Badge variant="secondary">{formatMix(summary)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{summary.newWordCount} new</Badge>
            <Badge variant="outline">{summary.dueReviewCount} review</Badge>
            {summary.weakDueCount > 0 ? (
              <Badge variant="outline">{summary.weakDueCount} weak</Badge>
            ) : null}
          </div>
        </CardContent>
        <CardFooter>
          <Button disabled={isBusy} onClick={onStart} type="button">
            <BookOpenCheck data-icon="inline-start" />
            {isBusy ? "Starting..." : "Start"}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const progress = summary.masteryProgressPercent;
  const isComplete = summary.completed;
  const isCapped = summary.completionReason === "question_cap";

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>
            {isCapped ? "Practice limit" : isComplete ? "Recall-ready" : "Today"}
          </CardTitle>
          <Badge variant={isComplete ? "default" : "secondary"}>
            {progress}% mastered
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          aria-label="Daily mastery"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="h-2.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-primary shadow-sm transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{summary.newWordCount} new</Badge>
          <Badge variant="outline">{summary.reviewWordCount} review</Badge>
          <Badge variant="outline">{summary.readyCount} ready</Badge>
          <Badge variant="outline">{formatPhase(summary.phase)}</Badge>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        <Button disabled={isBusy} onClick={onStart} type="button">
          {isComplete ? (
            <CheckCircle2 data-icon="inline-start" />
          ) : (
            <ArrowRight data-icon="inline-start" />
          )}
          {isBusy ? "Opening..." : isComplete ? "View results" : "Continue"}
        </Button>
        {onReset ? (
          <Button
            disabled={isBusy || isResetting}
            onClick={onReset}
            type="button"
            variant="outline"
          >
            <RotateCcw data-icon="inline-start" />
            {isResetting ? "Resetting..." : "Reset"}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function formatPhase(phase: ActiveSessionPhase) {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function formatMix(summary: Extract<TodaySessionSummary, { hasSession: false }>) {
  if (summary.newWordCount > 0 && summary.dueReviewCount > 0) {
    return `${summary.newWordCount} new + ${summary.dueReviewCount} review`;
  }

  if (summary.dueReviewCount > 0) {
    return `${summary.dueReviewCount} review`;
  }

  return `${summary.newWordCount} new`;
}
