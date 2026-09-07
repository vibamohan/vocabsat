import { describe, expect, test } from "vitest";

import { getSpeechText, speakText } from "@/lib/study/speech";

describe("speech helpers", () => {
  test("joins non-empty speech segments", () => {
    expect(getSpeechText(["  terse ", null, "brief", ""])).toBe(
      "terse. brief",
    );
  });

  test("returns false when speech synthesis is unavailable", () => {
    expect(speakText("terse")).toBe(false);
  });
});
