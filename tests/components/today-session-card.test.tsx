import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { TodaySessionCard } from "@/components/study/today-session-card";
import type { TodaySessionSummary } from "@/lib/study/types";

function noSession(
  overrides: Partial<Extract<TodaySessionSummary, { hasSession: false }>> = {},
): Extract<TodaySessionSummary, { hasSession: false }> {
  return {
    availableWordCount: 300,
    dailyWordCount: 6,
    dueReviewCount: 0,
    hasSession: false,
    newWordCount: 6,
    studyDate: "2026-05-20",
    weakDueCount: 0,
    ...overrides,
  };
}

function activeSession(
  overrides: Partial<Extract<TodaySessionSummary, { hasSession: true }>> = {},
): Extract<TodaySessionSummary, { hasSession: true }> {
  return {
    completed: false,
    completionReason: null,
    dailyWordCount: 6,
    dueReviewCount: 0,
    hasSession: true,
    masteryProgressPercent: 42,
    newWordCount: 6,
    phase: "practice",
    questionCap: 45,
    questionsAnswered: 8,
    readyCount: 2,
    reviewWordCount: 0,
    studyDate: "2026-05-20",
    weakDueCount: 0,
    wordCount: 6,
    ...overrides,
  };
}

describe("TodaySessionCard", () => {
  test("disables start when the word bank is too small", () => {
    render(
      <TodaySessionCard
        onStart={vi.fn()}
        summary={noSession({
          availableWordCount: 3,
          dailyWordCount: 6,
          newWordCount: 3,
        })}
      />,
    );

    expect(screen.getByText("Word bank")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  test("disables start when no words are due", () => {
    render(
      <TodaySessionCard
        onStart={vi.fn()}
        summary={noSession({
          dueReviewCount: 0,
          newWordCount: 0,
        })}
      />,
    );

    expect(screen.getByText("Caught up")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  test("starts a new session", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(<TodaySessionCard onStart={onStart} summary={noSession()} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test("shows active session progress", () => {
    render(<TodaySessionCard onStart={vi.fn()} summary={activeSession()} />);

    expect(screen.getByText("42% mastered")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Daily mastery" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  test("shows completed sessions as viewable results", () => {
    render(
      <TodaySessionCard
        onStart={vi.fn()}
        summary={activeSession({
          completed: true,
          completionReason: "mastered",
          masteryProgressPercent: 100,
          phase: "complete",
        })}
      />,
    );

    expect(screen.getByText("Recall-ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View results" })).toBeEnabled();
  });

  test("resets an active session when reset is available", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(
      <TodaySessionCard
        onReset={onReset}
        onStart={vi.fn()}
        summary={activeSession()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
