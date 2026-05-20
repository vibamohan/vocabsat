import { afterEach, describe, expect, test } from "vitest";

import {
  DEFAULT_DAILY_WORD_COUNT,
  DEFAULT_STUDY_TIME_ZONE,
  MAX_DAILY_WORD_COUNT,
  MIN_DAILY_WORD_COUNT,
  getDailyWordCount,
  getStudyTimeZone,
} from "@/lib/study/config";

const originalPublicCount = process.env.NEXT_PUBLIC_DAILY_WORD_COUNT;
const originalPrivateCount = process.env.DAILY_WORD_COUNT;
const originalPublicTimeZone = process.env.NEXT_PUBLIC_STUDY_TIME_ZONE;
const originalPrivateTimeZone = process.env.STUDY_TIME_ZONE;

afterEach(() => {
  process.env.NEXT_PUBLIC_DAILY_WORD_COUNT = originalPublicCount;
  process.env.DAILY_WORD_COUNT = originalPrivateCount;
  process.env.NEXT_PUBLIC_STUDY_TIME_ZONE = originalPublicTimeZone;
  process.env.STUDY_TIME_ZONE = originalPrivateTimeZone;
});

describe("study config", () => {
  test("uses the default daily word count when unset", () => {
    delete process.env.NEXT_PUBLIC_DAILY_WORD_COUNT;
    delete process.env.DAILY_WORD_COUNT;

    expect(getDailyWordCount()).toBe(DEFAULT_DAILY_WORD_COUNT);
  });

  test("clamps the daily word count to the minimum", () => {
    process.env.NEXT_PUBLIC_DAILY_WORD_COUNT = "2";
    delete process.env.DAILY_WORD_COUNT;

    expect(getDailyWordCount()).toBe(MIN_DAILY_WORD_COUNT);
  });

  test("clamps the daily word count to the maximum", () => {
    process.env.NEXT_PUBLIC_DAILY_WORD_COUNT = "20";
    delete process.env.DAILY_WORD_COUNT;

    expect(getDailyWordCount()).toBe(MAX_DAILY_WORD_COUNT);
  });

  test("prefers the public daily word count", () => {
    process.env.NEXT_PUBLIC_DAILY_WORD_COUNT = "5";
    process.env.DAILY_WORD_COUNT = "7";

    expect(getDailyWordCount()).toBe(5);
  });

  test("uses the default study time zone when unset", () => {
    delete process.env.NEXT_PUBLIC_STUDY_TIME_ZONE;
    delete process.env.STUDY_TIME_ZONE;

    expect(getStudyTimeZone()).toBe(DEFAULT_STUDY_TIME_ZONE);
  });

  test("prefers the public study time zone", () => {
    process.env.NEXT_PUBLIC_STUDY_TIME_ZONE = "America/New_York";
    process.env.STUDY_TIME_ZONE = "UTC";

    expect(getStudyTimeZone()).toBe("America/New_York");
  });
});
