import {
  QUESTION_TYPES,
  type LatestAttempt,
  type QuestionType,
  type SessionWordWithWord,
  type StudyQuestion,
  type StudySession,
} from "@/lib/study/types";

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  meaning_recognition: "Meaning recognition",
  reverse_recall: "Reverse recall",
  sat_usage: "SAT-style usage",
};

export function getQuestionTypeLabel(questionType: QuestionType) {
  return QUESTION_TYPE_LABELS[questionType];
}

export function getReadyCount(words: SessionWordWithWord[]) {
  return words.filter((word) => word.status === "recall_ready").length;
}

export function getSatisfiedTypes(word: SessionWordWithWord) {
  return QUESTION_TYPES.filter((questionType) =>
    isQuestionTypeSatisfied(word, questionType),
  );
}

export function isQuestionTypeSatisfied(
  word: SessionWordWithWord,
  questionType: QuestionType,
) {
  if (questionType === "meaning_recognition") {
    return word.satisfied_meaning_recognition;
  }

  if (questionType === "reverse_recall") {
    return word.satisfied_reverse_recall;
  }

  return word.satisfied_sat_usage;
}

export function isRecallReady(word: SessionWordWithWord) {
  return QUESTION_TYPES.every((questionType) =>
    isQuestionTypeSatisfied(word, questionType),
  );
}

export function buildNextQuestion(
  session: StudySession,
  words: SessionWordWithWord[],
  latestAttempt: LatestAttempt | null,
): StudyQuestion | null {
  const candidates = words.filter((word) => word.status !== "recall_ready");

  if (candidates.length === 0) {
    return null;
  }

  const combinations = candidates.flatMap((word) => {
    const unsatisfiedTypes = QUESTION_TYPES.filter(
      (questionType) => !isQuestionTypeSatisfied(word, questionType),
    );

    return unsatisfiedTypes.map((questionType) => ({
      word,
      questionType,
      score: getWordPriority(word) + getQuestionTypePriority(session, questionType),
    }));
  });

  const rankedCombinations = combinations.sort((first, second) => {
    const firstRepeatPenalty = getRepeatPenalty(first, latestAttempt);
    const secondRepeatPenalty = getRepeatPenalty(second, latestAttempt);
    const firstScore = first.score - firstRepeatPenalty;
    const secondScore = second.score - secondRepeatPenalty;

    if (firstScore !== secondScore) {
      return secondScore - firstScore;
    }

    if (first.word.last_attempted_at !== second.word.last_attempted_at) {
      if (!first.word.last_attempted_at) {
        return -1;
      }

      if (!second.word.last_attempted_at) {
        return 1;
      }

      return first.word.last_attempted_at.localeCompare(
        second.word.last_attempted_at,
      );
    }

    return first.word.position - second.word.position;
  });

  const selected = rankedCombinations[0];

  if (!selected) {
    return null;
  }

  return createQuestion(
    selected.word,
    selected.questionType,
    words,
    session.total_questions_answered,
  );
}

function getWordPriority(word: SessionWordWithWord) {
  const statusScore = {
    new: 45,
    shaky: 70,
    stable: 35,
    recall_ready: 0,
  }[word.status];

  const attemptScore =
    word.miss_count * 10 + word.guessed_count * 8 - word.correct_count * 2;
  const freshnessScore = word.last_attempted_at ? 0 : 8;

  return statusScore + attemptScore + freshnessScore;
}

function getQuestionTypePriority(
  session: StudySession,
  questionType: QuestionType,
) {
  const rotationIndex = session.total_questions_answered % QUESTION_TYPES.length;
  const questionTypeIndex = QUESTION_TYPES.indexOf(questionType);
  const distance =
    (questionTypeIndex - rotationIndex + QUESTION_TYPES.length) %
    QUESTION_TYPES.length;

  return QUESTION_TYPES.length - distance;
}

function getRepeatPenalty(
  combination: { word: SessionWordWithWord; questionType: QuestionType },
  latestAttempt: LatestAttempt | null,
) {
  if (!latestAttempt) {
    return 0;
  }

  if (
    latestAttempt.session_word_id === combination.word.id &&
    latestAttempt.question_type === combination.questionType
  ) {
    return 100;
  }

  if (latestAttempt.session_word_id === combination.word.id) {
    return 12;
  }

  return 0;
}

function createQuestion(
  target: SessionWordWithWord,
  questionType: QuestionType,
  words: SessionWordWithWord[],
  seed: number,
): StudyQuestion {
  const options = getOptions(target, words, questionType, seed);

  if (questionType === "meaning_recognition") {
    return {
      questionType,
      targetSessionWordId: target.id,
      targetVocabWordId: target.vocab_word_id,
      prompt: `${capitalize(target.vocab_word.word)} most nearly means:`,
      helperText: "Choose the meaning.",
      options,
    };
  }

  if (questionType === "reverse_recall") {
    return {
      questionType,
      targetSessionWordId: target.id,
      targetVocabWordId: target.vocab_word_id,
      prompt: `Which word means "${target.vocab_word.fast_meaning}"?`,
      helperText: "Choose the word.",
      options,
    };
  }

  return {
    questionType,
    targetSessionWordId: target.id,
    targetVocabWordId: target.vocab_word_id,
    prompt: blankExampleSentence(
      target.vocab_word.word,
      target.vocab_word.fast_meaning,
      target.vocab_word.example_sentence,
    ),
    helperText: "Choose the word that best completes the sentence.",
    options,
  };
}

function getOptions(
  target: SessionWordWithWord,
  words: SessionWordWithWord[],
  questionType: QuestionType,
  seed: number,
) {
  const optionWords = [
    target,
    ...words
      .filter((word) => word.vocab_word_id !== target.vocab_word_id)
      .sort(
        (first, second) =>
          stableRank(first.vocab_word_id, seed) -
          stableRank(second.vocab_word_id, seed),
      )
      .slice(0, 3),
  ].sort(
    (first, second) =>
      stableRank(first.vocab_word_id, seed + 17) -
      stableRank(second.vocab_word_id, seed + 17),
  );

  return optionWords.map((word) => ({
    vocabWordId: word.vocab_word_id,
    label:
      questionType === "meaning_recognition"
        ? word.vocab_word.fast_meaning
        : word.vocab_word.word,
  }));
}

function blankExampleSentence(
  word: string,
  fastMeaning: string,
  exampleSentence: string,
) {
  const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
  const blankedSentence = exampleSentence.replace(pattern, "______");

  if (blankedSentence !== exampleSentence) {
    return blankedSentence;
  }

  return `The sentence calls for a word meaning "${fastMeaning}": ______.`;
}

function stableRank(value: number, seed: number) {
  return (value * 1103515245 + seed * 12345) % 2147483647;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
