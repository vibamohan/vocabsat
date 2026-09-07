import { describe, expect, test } from "vitest";

import {
  MAX_WORD_NOTE_LENGTH,
  normalizeWordNote,
} from "@/lib/study/notes";

describe("normalizeWordNote", () => {
  test("trims notes and enforces the database limit", () => {
    expect(normalizeWordNote(`  ${"a".repeat(MAX_WORD_NOTE_LENGTH + 10)}  `)).toHaveLength(
      MAX_WORD_NOTE_LENGTH,
    );
  });
});
