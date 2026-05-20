import { afterEach, describe, expect, test } from "vitest";

import { addDaysToStudyDate, getStudyDate } from "@/lib/study/dates";

const originalPublicTimeZone = process.env.NEXT_PUBLIC_STUDY_TIME_ZONE;
const originalPrivateTimeZone = process.env.STUDY_TIME_ZONE;

afterEach(() => {
  process.env.NEXT_PUBLIC_STUDY_TIME_ZONE = originalPublicTimeZone;
  process.env.STUDY_TIME_ZONE = originalPrivateTimeZone;
});

describe("study dates", () => {
  test("formats dates in the configured study time zone", () => {
    process.env.NEXT_PUBLIC_STUDY_TIME_ZONE = "America/Los_Angeles";
    delete process.env.STUDY_TIME_ZONE;

    expect(getStudyDate(new Date("2026-05-20T06:30:00.000Z"))).toBe(
      "2026-05-19",
    );
  });

  test("adds days across month boundaries", () => {
    expect(addDaysToStudyDate("2026-05-30", 3)).toBe("2026-06-02");
  });

  test("subtracts days across year boundaries", () => {
    expect(addDaysToStudyDate("2026-01-01", -1)).toBe("2025-12-31");
  });
});
