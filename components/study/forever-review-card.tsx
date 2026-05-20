"use client";

import { ArrowRight, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ForeverReviewSummary } from "@/lib/study/types";

type ForeverReviewCardProps = {
  isBusy?: boolean;
  onStart: () => void;
  summary: ForeverReviewSummary;
};

export function ForeverReviewCard({
  isBusy = false,
  onStart,
  summary,
}: ForeverReviewCardProps) {
  const hasWords = summary.eligibleWordCount > 0;

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Forever Review</CardTitle>
          {hasWords ? (
            <Badge variant="outline">{summary.eligibleWordCount} learned</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Practice words you&apos;ve already learned.
        </p>
        {hasWords ? (
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {summary.weakCount > 0 ? (
              <Badge variant="outline">{summary.weakCount} weak</Badge>
            ) : null}
            {summary.dueCount > 0 ? (
              <Badge variant="outline">{summary.dueCount} due</Badge>
            ) : null}
            {summary.staleCount > 0 ? (
              <Badge variant="outline">{summary.staleCount} stale</Badge>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button
          disabled={isBusy || !hasWords}
          onClick={onStart}
          type="button"
          variant="outline"
        >
          {hasWords ? (
            <ArrowRight data-icon="inline-start" />
          ) : (
            <RotateCcw data-icon="inline-start" />
          )}
          {isBusy ? "Opening..." : "Start Review"}
        </Button>
      </CardFooter>
    </Card>
  );
}
