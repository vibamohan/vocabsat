"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatReviewedWordDate,
  getReviewedWordStatusLabel,
  getVisibleReviewedWords,
  REVIEWED_WORD_STATUS_FILTERS,
  type ReviewedWordSort,
  type ReviewedWordStatusFilter,
} from "@/lib/study/reviewed-words";
import type { ReviewedWord } from "@/lib/study/types";
import {
  getCurrentUser,
  getReviewedWords,
} from "@/lib/study/client-session";
import { createClient } from "@/lib/supabase/client";

export function WordsClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ReviewedWordSort>("last_seen");
  const [status, setStatus] = useState<ReviewedWordStatusFilter>("all");
  const [words, setWords] = useState<ReviewedWord[]>([]);

  const loadWords = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const currentUser = await getCurrentUser(supabase);

      if (!currentUser) {
        router.replace("/auth/login");
        return;
      }

      setWords(await getReviewedWords(supabase, currentUser.id));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load reviewed words.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  const visibleWords = useMemo(
    () => getVisibleReviewedWords({ query, sort, status, words }),
    [query, sort, status, words],
  );

  return (
    <StudyAppShell>
      <section className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Words</h1>
          <p className="text-sm text-muted-foreground">
            Reviewed vocabulary, newest first.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search words</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search word or meaning"
              type="search"
              value={query}
            />
          </label>

          <label className="flex flex-col gap-1 sm:w-40">
            <span className="sr-only">Filter by status</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onChange={(event) =>
                setStatus(event.target.value as ReviewedWordStatusFilter)
              }
              value={status}
            >
              {REVIEWED_WORD_STATUS_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {filter === "all" ? "All statuses" : getStatusFilterLabel(filter)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 sm:w-40">
            <span className="sr-only">Sort words</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onChange={(event) =>
                setSort(event.target.value as ReviewedWordSort)
              }
              value={sort}
            >
              <option value="last_seen">Last seen</option>
              <option value="most_missed">Most missed</option>
              <option value="word">A-Z</option>
            </select>
          </label>
        </div>

        {isLoading ? (
          <WordsTableSkeleton />
        ) : words.length === 0 ? (
          <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
            Reviewed words will appear here after you start studying.
          </div>
        ) : visibleWords.length === 0 ? (
          <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
            No reviewed words match those filters.
          </div>
        ) : (
          <ReviewedWordsTable words={visibleWords} />
        )}
      </section>
    </StudyAppShell>
  );
}

function ReviewedWordsTable({ words }: { words: ReviewedWord[] }) {
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Word</th>
            <th className="px-4 py-3 font-medium">Meaning</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Last seen</th>
            <th className="px-4 py-3 font-medium">Next due</th>
          </tr>
        </thead>
        <tbody>
          {words.map((word) => (
            <tr className="border-b last:border-0" key={word.vocab_word_id}>
              <td className="px-4 py-3 align-top font-medium">
                {word.vocab_word.word}
              </td>
              <td className="max-w-[22rem] px-4 py-3 align-top text-muted-foreground">
                {word.vocab_word.fast_meaning}
              </td>
              <td className="px-4 py-3 align-top">
                <Badge variant={word.status === "weak" ? "secondary" : "outline"}>
                  {getReviewedWordStatusLabel(word.status)}
                </Badge>
              </td>
              <td className="whitespace-nowrap px-4 py-3 align-top text-muted-foreground">
                {formatReviewedWordDate(word.last_seen_at)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 align-top text-muted-foreground">
                {formatReviewedWordDate(word.next_review_on)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WordsTableSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

function getStatusFilterLabel(status: Exclude<ReviewedWordStatusFilter, "all">) {
  return getReviewedWordStatusLabel(status);
}
