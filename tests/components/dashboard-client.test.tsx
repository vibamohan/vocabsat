import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { DashboardClient } from "@/components/study/dashboard-client";
import type { ForeverReviewSummary, TodaySessionSummary } from "@/lib/study/types";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getForeverReviewSummary: vi.fn(),
  getTodaySessionSummary: vi.fn(),
  pathname: "/dashboard",
  push: vi.fn(),
  replace: vi.fn(),
  resetTodaySession: vi.fn(),
  startOrContinueTodaySession: vi.fn(),
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
  },
}));

const router = vi.hoisted(() => ({
  push: mocks.push,
  replace: mocks.replace,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => router,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mocks.supabase,
}));

vi.mock("@/lib/study/client-session", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getForeverReviewSummary: mocks.getForeverReviewSummary,
  getTodaySessionSummary: mocks.getTodaySessionSummary,
  resetTodaySession: mocks.resetTodaySession,
  startOrContinueTodaySession: mocks.startOrContinueTodaySession,
}));

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

function reviewSummary(
  overrides: Partial<ForeverReviewSummary> = {},
): ForeverReviewSummary {
  return {
    dueCount: 0,
    eligibleWordCount: 3,
    staleCount: 0,
    studyDate: "2026-05-20",
    weakCount: 0,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getForeverReviewSummary.mockReset();
  mocks.getTodaySessionSummary.mockReset();
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.resetTodaySession.mockReset();
  mocks.startOrContinueTodaySession.mockReset();
  mocks.supabase.auth.signOut.mockReset();

  mocks.pathname = "/dashboard";
  mocks.getCurrentUser.mockResolvedValue({
    email: "learner@example.com",
    id: "user-1",
  });
  mocks.getForeverReviewSummary.mockResolvedValue(reviewSummary());
});

describe("DashboardClient", () => {
  test("reloads the daily card and clears stale opening state when returning to the dashboard", async () => {
    const user = userEvent.setup();
    const startRequest = deferred<void>();

    mocks.getTodaySessionSummary
      .mockResolvedValueOnce(activeSession())
      .mockResolvedValueOnce(
        activeSession({
          completed: true,
          completionReason: "mastered",
          masteryProgressPercent: 100,
          phase: "complete",
          readyCount: 6,
        }),
      );
    mocks.startOrContinueTodaySession.mockReturnValueOnce(startRequest.promise);

    const { rerender } = render(<DashboardClient />);

    await user.click(await screen.findByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("button", { name: "Opening..." }),
    ).toBeDisabled();

    await act(async () => {
      startRequest.resolve();
      await startRequest.promise;
    });

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/session");
    });

    mocks.pathname = "/session";
    rerender(<DashboardClient />);

    mocks.pathname = "/dashboard";
    rerender(<DashboardClient />);

    expect(
      await screen.findByRole("button", { name: "View results" }),
    ).toBeEnabled();
    expect(mocks.getTodaySessionSummary).toHaveBeenCalledTimes(2);
  });
});
