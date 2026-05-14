export const MIN_DAILY_WORD_COUNT = 5;
export const MAX_DAILY_WORD_COUNT = 7;
export const DEFAULT_DAILY_WORD_COUNT = 6;
export const QUESTION_CAP = 45;
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
