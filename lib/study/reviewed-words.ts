import { getStudyTimeZone } from "@/lib/study/config";
import type { ReviewedWord, UserWordStatus, VocabWord } from "@/lib/study/types";

export const REVIEWED_WORD_STATUS_FILTERS = [
  "all",
  "weak",
  "learning",
  "recall_ready",
  "known",
] as const;

export type ReviewedWordStatusFilter =
  (typeof REVIEWED_WORD_STATUS_FILTERS)[number];

export type ReviewedWordSort = "last_seen" | "most_missed" | "word";

export type ReviewedWordRow = {
  correct_count: number;
  guessed_count: number;
  last_ready_at: string | null;
  last_seen_at: string | null;
  miss_count: number;
  next_review_on: string | null;
  review_interval_days: number;
  status: UserWordStatus;
  vocab_word: VocabWord | VocabWord[] | null;
  vocab_word_id: number;
};

export function mapReviewedWordRows(rows: ReviewedWordRow[]): ReviewedWord[] {
  return rows.flatMap((row) => {
    const vocabWord = Array.isArray(row.vocab_word)
      ? row.vocab_word[0]
      : row.vocab_word;

    if (!row.last_seen_at || !vocabWord) {
      return [];
    }

    return [
      {
        correct_count: row.correct_count,
        guessed_count: row.guessed_count,
        last_ready_at: row.last_ready_at,
        last_seen_at: row.last_seen_at,
        miss_count: row.miss_count,
        next_review_on: row.next_review_on,
        review_interval_days: row.review_interval_days,
        status: row.status,
        vocab_word: vocabWord,
        vocab_word_id: row.vocab_word_id,
      },
    ];
  });
}

export function getVisibleReviewedWords({
  query,
  sort,
  status,
  words,
}: {
  query: string;
  sort: ReviewedWordSort;
  status: ReviewedWordStatusFilter;
  words: ReviewedWord[];
}) {
  return sortReviewedWords(
    filterReviewedWords(words, { query, status }),
    sort,
  );
}

export function filterReviewedWords(
  words: ReviewedWord[],
  {
    query,
    status,
  }: {
    query: string;
    status: ReviewedWordStatusFilter;
  },
) {
  const normalizedQuery = normalizeSearchText(query);

  return words.filter((word) => {
    if (status !== "all" && word.status !== status) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return normalizeSearchText(
      `${word.vocab_word.word} ${word.vocab_word.fast_meaning}`,
    ).includes(normalizedQuery);
  });
}

export function sortReviewedWords(
  words: ReviewedWord[],
  sort: ReviewedWordSort,
) {
  return [...words].sort((first, second) => {
    if (sort === "word") {
      return first.vocab_word.word.localeCompare(second.vocab_word.word);
    }

    if (sort === "most_missed") {
      const missComparison = second.miss_count - first.miss_count;

      if (missComparison !== 0) {
        return missComparison;
      }

      const guessedComparison = second.guessed_count - first.guessed_count;

      if (guessedComparison !== 0) {
        return guessedComparison;
      }
    }

    const seenComparison =
      Date.parse(second.last_seen_at) - Date.parse(first.last_seen_at);

    if (seenComparison !== 0) {
      return seenComparison;
    }

    return first.vocab_word.word.localeCompare(second.vocab_word.word);
  });
}

export function getReviewedWordStatusLabel(status: UserWordStatus) {
  if (status === "recall_ready") {
    return "Recall-ready";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatReviewedWordDate(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);

  if (!Number.isFinite(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: value.includes("T") ? getStudyTimeZone() : "UTC",
  }).format(date);
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}
