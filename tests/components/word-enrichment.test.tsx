import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  getVocabImageUrl,
  WordEnrichment,
} from "@/components/study/word-enrichment";
import { vocabWord } from "@/tests/study/factories";

describe("WordEnrichment", () => {
  test("shows curated morphology and confusables", () => {
    render(
      <WordEnrichment
        word={vocabWord({
          confusable_words: ["uninterested"],
          etymology: "From Latin dis- and interesse.",
          prefixes: ["dis-"],
          roots: ["interest"],
        })}
      />,
    );

    expect(screen.getByText("dis-")).toBeInTheDocument();
    expect(screen.getByText(/uninterested/)).toBeInTheDocument();
    expect(screen.getByText(/From Latin/)).toBeInTheDocument();
  });

  test("rejects unsafe storage paths", () => {
    expect(getVocabImageUrl("../secret.png")).toBeNull();
  });
});
