import { getStudyTimeZone } from "@/lib/study/config";

export function getStudyDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: getStudyTimeZone(),
    year: "numeric",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to resolve the current study date.");
  }

  return `${year}-${month}-${day}`;
}
