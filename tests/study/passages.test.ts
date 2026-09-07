import { describe, expect, test } from "vitest";

import { blankPassageWord, isPassageAnswerCorrect } from "@/lib/study/passages";

describe("passage helpers", () => {
  test("blanks the target word without changing partial matches", () => {
    expect(blankPassageWord("The candid answer showed candor.", "candid")).toBe(
      "The ______ answer showed candor.",
    );
  });

  test("grades passage answers case-insensitively", () => {
    expect(isPassageAnswerCorrect(" Candid ", "candid")).toBe(true);
  });
});
