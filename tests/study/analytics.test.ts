import { describe, expect, test } from "vitest";

import {
  formatResponseTime,
  formatStudyDuration,
  formatStudyPercent,
} from "@/lib/study/analytics";

describe("study analytics formatters", () => {
  test("formats percentages", () => {
    expect(formatStudyPercent(0.876)).toBe("88%");
  });

  test("formats active duration", () => {
    expect(formatStudyDuration(5_400_000)).toBe("1h 30m");
  });

  test("formats response latency", () => {
    expect(formatResponseTime(1_250)).toBe("1.3s");
    expect(formatResponseTime(null)).toBe("—");
  });
});
