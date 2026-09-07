export type SchedulerRating = 1 | 2 | 3 | 4;

export function getSchedulerRating(
  outcome: "correct" | "incorrect" | "unsure" | "already_known",
): SchedulerRating {
  if (outcome === "incorrect") return 1;
  if (outcome === "unsure") return 2;
  if (outcome === "already_known") return 4;
  return 3;
}
