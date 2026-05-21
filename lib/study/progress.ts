import { QUESTION_TYPES, type SessionWordWithWord } from "@/lib/study/types";

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
  const totalUnits = words.length * QUESTION_TYPES.length;
  const wordProgress = words.map((word) => {
    const completedUnits = getCompletedUnits(word);

    return {
      completedUnits,
      id: word.id,
      percent: getPercent(completedUnits, QUESTION_TYPES.length),
      totalUnits: QUESTION_TYPES.length,
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
  if (word.status === "recall_ready") {
    return QUESTION_TYPES.length;
  }

  return [
    word.satisfied_meaning_recognition,
    word.satisfied_reverse_recall,
    word.satisfied_sat_usage,
    word.satisfied_word_recall,
    word.satisfied_definition_recall,
  ].filter(Boolean).length;
}

function getPercent(completedUnits: number, totalUnits: number) {
  if (totalUnits === 0) {
    return 0;
  }

  return Math.round((completedUnits / totalUnits) * 100);
}
