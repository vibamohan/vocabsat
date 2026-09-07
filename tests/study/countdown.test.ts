import { describe, expect, test } from "vitest";

import { getRemainingSeconds } from "@/lib/study/countdown";

describe("getRemainingSeconds", () => {
  test("rounds partial seconds up and never returns a negative value", () => {
    expect(getRemainingSeconds(2_001, 1_000)).toBe(2);
    expect(getRemainingSeconds(1_000, 2_000)).toBe(0);
  });
});
