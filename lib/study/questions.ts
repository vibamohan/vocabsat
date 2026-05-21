import {
  QUESTION_TYPES,
  type LatestAttempt,
  type QuestionType,
  type SessionWordWithWord,
  type StudyQuestion,
  type StudySession,
  type TypedAnswerGrade,
  type VocabWord,
} from "@/lib/study/types";
import { getExampleSentences } from "@/lib/study/example-sentences";

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  definition_recall: "Definition recall",
  meaning_recognition: "Meaning recognition",
  reverse_recall: "Reverse recall",
  sat_usage: "SAT-style usage",
  word_recall: "Word recall",
};

export function getQuestionTypeLabel(questionType: QuestionType) {
  return QUESTION_TYPE_LABELS[questionType];
}

export function isMultipleChoiceQuestionType(questionType: QuestionType) {
  return (
    questionType === "meaning_recognition" ||
    questionType === "reverse_recall" ||
    questionType === "sat_usage"
  );
}

export function gradeTypedAnswer(
  questionType: QuestionType,
  word: VocabWord,
  typedAnswer: string,
): TypedAnswerGrade {
  if (questionType === "word_recall") {
    return normalizeWordAnswer(typedAnswer) === normalizeWordAnswer(word.word)
      ? "correct"
      : "incorrect";
  }

  if (questionType !== "definition_recall") {
    return "incorrect";
  }

  return gradeDefinitionAnswer(word.fast_meaning, typedAnswer);
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

  if (questionType === "sat_usage") {
    return word.satisfied_sat_usage;
  }

  if (questionType === "word_recall") {
    return word.satisfied_word_recall;
  }

  return word.satisfied_definition_recall;
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
  optionWords: VocabWord[] = words.map((word) => word.vocab_word),
): StudyQuestion | null {
  const candidates = words.filter((word) => word.status !== "recall_ready");

  if (candidates.length === 0) {
    return null;
  }

  const combinations = candidates.flatMap((word) => {
    const questionType = getNextUnsatisfiedQuestionType(word);

    return questionType
      ? [
          {
            word,
            questionType,
            score: getWordPriority(word) + getStagePriority(questionType),
          },
        ]
      : [];
  });

  const rankedCombinations = combinations.sort((first, second) => {
    const firstBlocked = isSpacingBlocked(first.word, latestAttempt);
    const secondBlocked = isSpacingBlocked(second.word, latestAttempt);

    if (firstBlocked !== secondBlocked) {
      return firstBlocked ? 1 : -1;
    }

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
    optionWords,
    getQuestionSeed(session),
  );
}

export function buildNextForeverReviewQuestion(
  session: StudySession,
  words: SessionWordWithWord[],
  latestAttempt: LatestAttempt | null,
  optionWords: VocabWord[] = words.map((word) => word.vocab_word),
): StudyQuestion | null {
  if (words.length === 0) {
    return null;
  }

  const combinations = words.map((word) => {
    const questionType =
      getNextUnsatisfiedQuestionType(word) ??
      getReviewQuestionType(session, word);

    return {
      word,
      questionType,
      score: getForeverReviewWordPriority(word) + getStagePriority(questionType),
    };
  });

  const rankedCombinations = combinations.sort((first, second) => {
    const firstBlocked = isSpacingBlocked(first.word, latestAttempt);
    const secondBlocked = isSpacingBlocked(second.word, latestAttempt);

    if (firstBlocked !== secondBlocked) {
      return firstBlocked ? 1 : -1;
    }

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
    optionWords,
    getQuestionSeed(session),
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

function getForeverReviewWordPriority(word: SessionWordWithWord) {
  const statusScore = {
    new: 45,
    shaky: 110,
    stable: 45,
    recall_ready: 12,
  }[word.status];

  const attemptScore =
    word.miss_count * 18 + word.guessed_count * 16 - word.correct_count * 2;
  const freshnessScore = word.last_attempted_at ? 0 : 12;

  return statusScore + attemptScore + freshnessScore;
}

function getNextUnsatisfiedQuestionType(word: SessionWordWithWord) {
  return QUESTION_TYPES.find(
    (questionType) => !isQuestionTypeSatisfied(word, questionType),
  );
}

function getReviewQuestionType(
  session: StudySession,
  word: SessionWordWithWord,
) {
  const seed = session.total_questions_answered + word.position;
  return QUESTION_TYPES[seed % QUESTION_TYPES.length];
}

function getStagePriority(questionType: QuestionType) {
  const stageIndex = QUESTION_TYPES.indexOf(questionType);
  return (QUESTION_TYPES.length - stageIndex) * 3;
}

function isSpacingBlocked(
  word: SessionWordWithWord,
  latestAttempt: LatestAttempt | null,
) {
  return latestAttempt?.session_word_id === word.id;
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
    return 140;
  }

  if (latestAttempt.session_word_id === combination.word.id) {
    return 100;
  }

  return 0;
}

function createQuestion(
  target: SessionWordWithWord,
  questionType: QuestionType,
  words: SessionWordWithWord[],
  optionWords: VocabWord[],
  seed: number,
): StudyQuestion {
  const options = getOptions(target, words, optionWords, questionType, seed);

  if (questionType === "meaning_recognition") {
    return {
      answerMode: "multiple_choice",
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
      answerMode: "multiple_choice",
      questionType,
      targetSessionWordId: target.id,
      targetVocabWordId: target.vocab_word_id,
      prompt: `Which word means "${target.vocab_word.fast_meaning}"?`,
      helperText: "Choose the word.",
      options,
    };
  }

  const blankedPrompt = blankExampleSentence(
    target.vocab_word.word,
    target.vocab_word.fast_meaning,
    getExampleSentenceForQuestion(
      target.vocab_word.word,
      target.vocab_word.example_sentence,
      stableRank(target.vocab_word_id, seed + 31),
    ),
  );

  if (questionType === "sat_usage") {
    return {
      answerMode: "multiple_choice",
      questionType,
      targetSessionWordId: target.id,
      targetVocabWordId: target.vocab_word_id,
      prompt: blankedPrompt,
      helperText: "Choose the word that best completes the sentence.",
      options,
    };
  }

  if (questionType === "word_recall") {
    return {
      answerMode: "typed",
      questionType,
      targetSessionWordId: target.id,
      targetVocabWordId: target.vocab_word_id,
      prompt: blankedPrompt,
      helperText: "Type the word that best completes the sentence.",
      options: [],
    };
  }

  return {
    answerMode: "typed",
    questionType,
    targetSessionWordId: target.id,
    targetVocabWordId: target.vocab_word_id,
    prompt: `What does ${target.vocab_word.word} mean?`,
    helperText: "Type a short meaning.",
    options: [],
  };
}

function getOptions(
  target: SessionWordWithWord,
  words: SessionWordWithWord[],
  optionWords: VocabWord[],
  questionType: QuestionType,
  seed: number,
) {
  const sessionOptionWords = words.map((word) => word.vocab_word);
  const studiedDistractors = sessionOptionWords
    .filter((word) => word.id !== target.vocab_word_id)
    .sort(
      (first, second) =>
        stableRank(first.id, seed) - stableRank(second.id, seed),
    )
    .slice(0, 2);
  const studiedDistractorIds = new Set(studiedDistractors.map((word) => word.id));
  const fallbackDistractors = optionWords
    .filter(
      (word) =>
        word.id !== target.vocab_word_id && !studiedDistractorIds.has(word.id),
    )
    .sort(
      (first, second) =>
        stableRank(first.id, seed + 11) - stableRank(second.id, seed + 11),
    )
    .slice(0, 3 - studiedDistractors.length);

  const optionChoices = [
    target.vocab_word,
    ...studiedDistractors,
    ...fallbackDistractors,
  ].sort(
    (first, second) =>
      stableRank(first.id, seed + 17) - stableRank(second.id, seed + 17),
  );

  return optionChoices.map((word) => ({
    vocabWordId: word.id,
    label:
      questionType === "meaning_recognition"
        ? word.fast_meaning
        : word.word,
  }));
}

function blankExampleSentence(
  word: string,
  fastMeaning: string,
  exampleSentence: string,
) {
  const pattern = getWordPattern(word);
  const blankedSentence = exampleSentence.replace(pattern, "______");

  if (blankedSentence !== exampleSentence) {
    return blankedSentence;
  }

  return `The sentence calls for a word meaning "${fastMeaning}": ______.`;
}

function getExampleSentenceForQuestion(
  word: string,
  exampleSentence: string,
  seed: number,
) {
  const examples = getExampleSentences(exampleSentence);
  const pattern = getWordPattern(word);
  const blankableExamples = examples.filter((example) => pattern.test(example));
  const choices = blankableExamples.length > 0 ? blankableExamples : examples;

  return choices[Math.abs(seed) % choices.length] ?? "";
}

function stableRank(value: number, seed: number) {
  let hash = 2166136261;

  hash ^= value;
  hash = Math.imul(hash, 16777619);
  hash ^= seed;
  hash = Math.imul(hash, 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

function getQuestionSeed(session: StudySession) {
  return getStringSeed(session.id) + session.total_questions_answered;
}

function getStringSeed(value: string) {
  let seed = 0;

  for (let index = 0; index < value.length; index += 1) {
    seed = (seed * 31 + value.charCodeAt(index)) % 2147483647;
  }

  return seed;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getWordPattern(word: string) {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function gradeDefinitionAnswer(
  fastMeaning: string,
  typedAnswer: string,
): TypedAnswerGrade {
  const meaningTokens = getMeaningTokens(fastMeaning);
  const answerTokens = new Set(getMeaningTokens(typedAnswer));

  if (meaningTokens.length === 0 || answerTokens.size === 0) {
    return "incorrect";
  }

  const overlapCount = meaningTokens.filter((token) =>
    answerTokens.has(token),
  ).length;
  const ratio = overlapCount / meaningTokens.length;

  if (overlapCount >= Math.min(2, meaningTokens.length) && ratio >= 0.5) {
    return "correct";
  }

  return overlapCount === 0 ? "incorrect" : "unsure";
}

function normalizeWordAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/s\b/, ""))
    .join(" ");
}

function getMeaningTokens(value: string) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "be",
    "by",
    "for",
    "in",
    "is",
    "of",
    "or",
    "the",
    "to",
    "with",
    "without",
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .map((token) => token.replace(/s\b/, ""));
}
