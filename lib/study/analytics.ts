export type QuestionTypeAnalytics = {
  attempts: number;
  correct: number;
  median_response_time_ms: number | null;
  question_type: string;
  timed_out: number;
  unsure: number;
};

export type StudyAnalytics = {
  accuracy: number;
  activeTimeMs: number;
  attempts: number;
  byQuestionType: QuestionTypeAnalytics[];
  medianResponseTimeMs: number | null;
  reviewRetention: number;
  timeoutRate: number;
};

export function formatStudyPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatStudyDuration(milliseconds: number) {
  const totalMinutes = Math.round(milliseconds / 60_000);

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatResponseTime(milliseconds: number | null) {
  if (milliseconds === null) {
    return "—";
  }

  return `${(milliseconds / 1_000).toFixed(1)}s`;
}
