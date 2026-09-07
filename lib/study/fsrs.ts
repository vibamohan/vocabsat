import {
  createEmptyCard,
  fsrs,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";

import type { SchedulerRating } from "@/lib/study/scheduler-rating";

export type PersistedFsrsState = {
  correct_count: number;
  fsrs_difficulty?: number | null;
  fsrs_due?: string | null;
  fsrs_elapsed_days?: number | null;
  fsrs_lapses?: number | null;
  fsrs_last_review?: string | null;
  fsrs_reps?: number | null;
  fsrs_scheduled_days?: number | null;
  fsrs_stability?: number | null;
  fsrs_state?: number | null;
  guessed_count: number;
  last_seen_at: string | null;
  miss_count: number;
  next_review_on: string | null;
  review_interval_days: number;
};

export type FsrsScheduleUpdate = {
  fsrs_difficulty: number;
  fsrs_due: string;
  fsrs_elapsed_days: number;
  fsrs_lapses: number;
  fsrs_last_review: string | null;
  fsrs_reps: number;
  fsrs_scheduled_days: number;
  fsrs_stability: number;
  fsrs_state: number;
  fsrs_version: string;
  next_review_on: string;
  review_interval_days: number;
};

const scheduler = fsrs({
  enable_fuzz: false,
  enable_short_term: false,
  request_retention: 0.9,
});

export function scheduleFsrsReview(
  persisted: PersistedFsrsState | null,
  rating: SchedulerRating,
  reviewedAt: Date,
): FsrsScheduleUpdate {
  const card = persisted ? toFsrsCard(persisted, reviewedAt) : createEmptyCard(reviewedAt);
  const result = scheduler.next(card, reviewedAt, rating as Grade).card;

  return {
    fsrs_difficulty: result.difficulty,
    fsrs_due: result.due.toISOString(),
    fsrs_elapsed_days: result.elapsed_days,
    fsrs_lapses: result.lapses,
    fsrs_last_review: result.last_review?.toISOString() ?? null,
    fsrs_reps: result.reps,
    fsrs_scheduled_days: result.scheduled_days,
    fsrs_stability: result.stability,
    fsrs_state: result.state,
    fsrs_version: "ts-fsrs-5.4",
    next_review_on: result.due.toISOString().slice(0, 10),
    review_interval_days: result.scheduled_days,
  };
}

export function toFsrsCard(
  persisted: PersistedFsrsState,
  now: Date,
): Card {
  if (
    persisted.fsrs_due &&
    persisted.fsrs_stability != null &&
    persisted.fsrs_difficulty != null
  ) {
    return {
      difficulty: persisted.fsrs_difficulty,
      due: new Date(persisted.fsrs_due),
      elapsed_days: persisted.fsrs_elapsed_days ?? 0,
      lapses: persisted.fsrs_lapses ?? 0,
      last_review: persisted.fsrs_last_review
        ? new Date(persisted.fsrs_last_review)
        : undefined,
      learning_steps: 0,
      reps: persisted.fsrs_reps ?? 0,
      scheduled_days: persisted.fsrs_scheduled_days ?? 0,
      stability: persisted.fsrs_stability,
      state: toFsrsState(persisted.fsrs_state),
    };
  }

  if (persisted.review_interval_days <= 0 && !persisted.last_seen_at) {
    return createEmptyCard(now);
  }

  const lastReview = persisted.last_seen_at
    ? new Date(persisted.last_seen_at)
    : now;
  const legacyDue = persisted.next_review_on
    ? new Date(`${persisted.next_review_on}T00:00:00.000Z`)
    : now;
  const elapsedDays = Math.max(
    0,
    Math.floor((now.getTime() - lastReview.getTime()) / 86_400_000),
  );

  return {
    difficulty: getLegacyDifficulty(persisted),
    due: legacyDue,
    elapsed_days: elapsedDays,
    lapses: persisted.miss_count,
    last_review: lastReview,
    learning_steps: 0,
    reps: Math.max(
      1,
      persisted.correct_count + persisted.guessed_count + persisted.miss_count,
    ),
    scheduled_days: Math.max(1, persisted.review_interval_days),
    stability: Math.max(0.1, persisted.review_interval_days || 0.1),
    state: State.Review,
  };
}

function getLegacyDifficulty(persisted: PersistedFsrsState) {
  const attempts =
    persisted.correct_count + persisted.guessed_count + persisted.miss_count;

  if (attempts === 0) return 5;

  return Math.min(
    10,
    Math.max(1, 3 + ((persisted.miss_count + persisted.guessed_count * 0.5) / attempts) * 7),
  );
}

function toFsrsState(value: number | null | undefined) {
  return value === State.Learning ||
    value === State.Review ||
    value === State.Relearning
    ? value
    : State.New;
}
