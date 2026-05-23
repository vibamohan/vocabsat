export const MIN_DAILY_WORD_COUNT = 5;
export const MAX_DAILY_WORD_COUNT = 7;
export const DEFAULT_DAILY_WORD_COUNT = 6;
export const DAILY_CHUNK_SIZE = 6;
export const DAILY_NEW_WORD_COUNT = 6;
export const DAILY_REVIEW_WORD_COUNT = 6;
export const FOREVER_REVIEW_CHUNK_SIZE = 6;
export const QUESTION_CAP = 45;
export const FOREVER_REVIEW_QUESTION_CAP = 32767;
export const MAX_DAILY_REVIEW_WORD_COUNT = DAILY_REVIEW_WORD_COUNT;
export const QUESTION_CAP_PER_WORD = 6;
export const FOREVER_REVIEW_STALE_DAYS = 30;
export const RECENT_WORD_COOLDOWN_COUNT = 3;
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const;
export const DEFAULT_STUDY_TIME_ZONE = "America/Los_Angeles";

export function getDailyWordCount() {
  const configuredCount =
    process.env.NEXT_PUBLIC_DAILY_WORD_COUNT ?? process.env.DAILY_WORD_COUNT;
  const parsedCount = Number.parseInt(configuredCount ?? "", 10);

  if (!Number.isInteger(parsedCount)) {
    return DEFAULT_DAILY_WORD_COUNT;
  }

  return Math.min(
    MAX_DAILY_WORD_COUNT,
    Math.max(MIN_DAILY_WORD_COUNT, parsedCount),
  );
}

export function getStudyTimeZone() {
  return (
    process.env.NEXT_PUBLIC_STUDY_TIME_ZONE ??
    process.env.STUDY_TIME_ZONE ??
    DEFAULT_STUDY_TIME_ZONE
  );
}
