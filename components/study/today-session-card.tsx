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
    summary.availableWordCount < summary.dailyWordCount
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

  if (!summary.hasSession) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Today</CardTitle>
            <Badge variant="secondary">{summary.dailyWordCount} new words</Badge>
          </div>
        </CardHeader>
        <CardFooter>
          <Button disabled={isBusy} onClick={onStart} type="button">
            <BookOpenCheck data-icon="inline-start" />
            {isBusy ? "Starting..." : "Start"}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const progress = Math.round((summary.readyCount / summary.wordCount) * 100);
  const isComplete = summary.completed;

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{isComplete ? "Recall-ready" : "Today"}</CardTitle>
          <Badge variant={isComplete ? "default" : "secondary"}>
            {summary.readyCount} of {summary.wordCount} ready
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">
            {summary.questionsAnswered} / {summary.questionCap} questions
          </Badge>
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
