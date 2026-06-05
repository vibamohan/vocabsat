import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { WordsClient } from "@/components/study/words-client";
import type { ReviewedWord } from "@/lib/study/types";
import { vocabWord } from "../study/factories";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getReviewedWords: vi.fn(),
  replace: vi.fn(),
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
  },
}));

const router = vi.hoisted(() => ({
  replace: mocks.replace,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mocks.supabase,
}));

vi.mock("@/lib/study/client-session", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getReviewedWords: mocks.getReviewedWords,
}));

function reviewedWord(overrides: Partial<ReviewedWord> = {}): ReviewedWord {
  const word = overrides.vocab_word ?? vocabWord({ id: overrides.vocab_word_id });

  return {
    correct_count: 1,
    guessed_count: 0,
    last_ready_at: null,
    last_seen_at: "2026-05-20T12:00:00.000Z",
    miss_count: 0,
    next_review_on: "2026-05-21",
    review_interval_days: 1,
    status: "learning",
    vocab_word: word,
    vocab_word_id: word.id,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getReviewedWords.mockReset();
  mocks.replace.mockReset();
  mocks.supabase.auth.signOut.mockReset();

  mocks.getCurrentUser.mockResolvedValue({
    email: "learner@example.com",
    id: "user-1",
  });
});

describe("WordsClient", () => {
  test("redirects unauthenticated users to login", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    mocks.getReviewedWords.mockResolvedValueOnce([]);

    render(<WordsClient />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/login");
    });
  });

  test("shows an empty state when no words have been reviewed", async () => {
    mocks.getReviewedWords.mockResolvedValueOnce([]);

    render(<WordsClient />);

    expect(
      await screen.findByText("Reviewed words will appear here after you start studying."),
    ).toBeInTheDocument();
  });

  test("renders reviewed words in a compact table", async () => {
    mocks.getReviewedWords.mockResolvedValueOnce([
      reviewedWord({
        status: "weak",
        vocab_word: vocabWord({
          fast_meaning: "careless, routine",
          id: 1,
          word: "perfunctory",
        }),
      }),
    ]);

    render(<WordsClient />);

    expect(await screen.findByRole("columnheader", { name: "Word" })).toBeInTheDocument();
    expect(screen.getByText("perfunctory")).toBeInTheDocument();
    expect(screen.getByText("careless, routine")).toBeInTheDocument();
    expect(screen.getAllByText("Weak")).toHaveLength(2);
  });

  test("filters reviewed words by search and status", async () => {
    const user = userEvent.setup();

    mocks.getReviewedWords.mockResolvedValueOnce([
      reviewedWord({
        status: "weak",
        vocab_word: vocabWord({
          fast_meaning: "careless, routine",
          id: 1,
          word: "perfunctory",
        }),
      }),
      reviewedWord({
        status: "known",
        vocab_word: vocabWord({
          fast_meaning: "harmful",
          id: 2,
          word: "inimical",
        }),
      }),
    ]);

    render(<WordsClient />);

    await screen.findByText("perfunctory");
    await user.type(screen.getByRole("searchbox", { name: "Search words" }), "harm");
    await user.selectOptions(screen.getByLabelText("Filter by status"), "known");

    expect(screen.queryByText("perfunctory")).not.toBeInTheDocument();
    expect(screen.getByText("inimical")).toBeInTheDocument();
  });

  test("sorts reviewed words by most missed", async () => {
    const user = userEvent.setup();

    mocks.getReviewedWords.mockResolvedValueOnce([
      reviewedWord({
        miss_count: 0,
        vocab_word: vocabWord({ id: 1, word: "abate" }),
      }),
      reviewedWord({
        miss_count: 4,
        vocab_word: vocabWord({ id: 2, word: "zealous" }),
      }),
    ]);

    render(<WordsClient />);

    await screen.findByText("abate");
    await user.selectOptions(screen.getByLabelText("Sort words"), "most_missed");

    const rows = screen.getAllByRole("row");

    expect(rows[1]).toHaveTextContent("zealous");
    expect(rows[2]).toHaveTextContent("abate");
  });
});
