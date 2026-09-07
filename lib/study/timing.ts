export type QuestionTimingResult = {
  answeredAt: string;
  responseTimeMs: number;
  shownAt: string;
};

type QuestionTimer = {
  finish: () => QuestionTimingResult;
  pause: () => void;
  resume: () => void;
};

export function createQuestionTimer({
  monotonicNow = () => performance.now(),
  wallNow = () => new Date(),
}: {
  monotonicNow?: () => number;
  wallNow?: () => Date;
} = {}): QuestionTimer {
  const shownAt = wallNow().toISOString();
  let activeStartedAt = monotonicNow();
  let activeDurationMs = 0;
  let isActive = true;
  let result: QuestionTimingResult | null = null;

  const pause = () => {
    if (!isActive || result) {
      return;
    }

    activeDurationMs += Math.max(0, monotonicNow() - activeStartedAt);
    isActive = false;
  };

  const resume = () => {
    if (isActive || result) {
      return;
    }

    activeStartedAt = monotonicNow();
    isActive = true;
  };

  const finish = () => {
    if (result) {
      return result;
    }

    pause();
    result = {
      answeredAt: wallNow().toISOString(),
      responseTimeMs: Math.min(3_600_000, Math.round(activeDurationMs)),
      shownAt,
    };

    return result;
  };

  return { finish, pause, resume };
}
