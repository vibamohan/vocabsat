import { describe, expect, test } from "vitest";

import {
  getExampleSentences,
  getPrimaryExampleSentence,
} from "@/lib/study/example-sentences";

describe("example sentence parsing", () => {
  test("splits pipe-delimited examples", () => {
    expect(getExampleSentences("First. | Second.")).toEqual([
      "First.",
      "Second.",
    ]);
  });

  test("removes empty examples", () => {
    expect(getExampleSentences(" First. | | Second. | ")).toEqual([
      "First.",
      "Second.",
    ]);
  });

  test("returns the first example as primary", () => {
    expect(getPrimaryExampleSentence(" First. | Second.")).toBe("First.");
  });

  test("returns an empty primary example when none exist", () => {
    expect(getPrimaryExampleSentence(" | ")).toBe("");
  });
});
