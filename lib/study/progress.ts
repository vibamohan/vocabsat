import {
  getCompletedMasteryStepCount,
  getMasteryStepCount,
} from "@/lib/study/questions";
import type { SessionWordWithWord } from "@/lib/study/types";

export type StudyProgress = {
  completedUnits: number;
  percent: number;
  totalUnits: number;
  totalWords: number;
  wordProgress: Array<{
    completedUnits: number;
    id: string;
    percent: number;
    totalUnits: number;
  }>;
};

export function getStudyProgress(words: SessionWordWithWord[]): StudyProgress {
  const masteryStepCount = getMasteryStepCount();
  const totalUnits = words.length * masteryStepCount;
  const wordProgress = words.map((word) => {
    const completedUnits = getCompletedUnits(word);

    return {
      completedUnits,
      id: word.id,
      percent: getPercent(completedUnits, masteryStepCount),
      totalUnits: masteryStepCount,
    };
  });
  const completedUnits = wordProgress.reduce(
    (total, word) => total + word.completedUnits,
    0,
  );

  return {
    completedUnits,
    percent: getPercent(completedUnits, totalUnits),
    totalUnits,
    totalWords: words.length,
    wordProgress,
  };
}

function getCompletedUnits(word: SessionWordWithWord) {
  return getCompletedMasteryStepCount(word);
}

function getPercent(completedUnits: number, totalUnits: number) {
  if (totalUnits === 0) {
    return 0;
  }

  return Math.round((completedUnits / totalUnits) * 100);
}
