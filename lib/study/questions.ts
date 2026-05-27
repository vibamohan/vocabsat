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
import {
  DAILY_CHUNK_SIZE,
  FOREVER_REVIEW_CHUNK_SIZE,
  RECENT_WORD_COOLDOWN_COUNT,
} from "@/lib/study/config";
import { getExampleSentences } from "@/lib/study/example-sentences";
import random from "random";

type RecentAttemptsInput = LatestAttempt | LatestAttempt[] | null;

type QuestionCombination = {
  word: SessionWordWithWord;
  questionType: QuestionType;
  score: number;
};

type SchedulerMode = "daily" | "forever_review";

type WordAttemptStats = {
  difficultyScore: number;
  lastAttemptIndex: number;
};

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  definition_recall: "Definition recall",
  meaning_recognition: "Meaning recognition",
  reverse_recall: "Reverse recall",
  sat_usage: "SAT-style usage",
  typed_reverse_recall: "Typed reverse recall",
  word_recall: "Word recall",
};

const MASTERY_STEP_COUNT = 5;

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
  if (
    questionType === "word_recall" ||
    questionType === "typed_reverse_recall"
  ) {
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

  if (questionType === "typed_reverse_recall") {
    return word.satisfied_typed_reverse_recall;
  }

  return word.satisfied_definition_recall;
}

export function isRecallReady(word: SessionWordWithWord) {
  return getCompletedMasteryStepCount(word) === MASTERY_STEP_COUNT;
}

export function getMasteryStepCount() {
  return MASTERY_STEP_COUNT;
}

export function getCompletedMasteryStepCount(word: SessionWordWithWord) {
  if (word.status === "recall_ready") {
    return MASTERY_STEP_COUNT;
  }

  return [
    hasRecognitionMastery(word),
    word.satisfied_sat_usage,
    word.satisfied_word_recall,
    word.satisfied_definition_recall,
    word.satisfied_typed_reverse_recall,
  ].filter(Boolean).length;
}

export function buildNextQuestion(
  session: StudySession,
  words: SessionWordWithWord[],
  recentAttempts: RecentAttemptsInput,
  optionWords: VocabWord[] = words.map((word) => word.vocab_word),
): StudyQuestion | null {
  return buildNextScheduledQuestion({
    chunkSize: DAILY_CHUNK_SIZE,
    getQuestionType: getNextUnsatisfiedMasteryQuestionType,
    getWordPriority,
    isEligible: (word) => word.status !== "recall_ready",
    mode: "daily",
    optionWords,
    recentAttempts,
    session,
    words,
  });
}

export function buildNextForeverReviewQuestion(
  session: StudySession,
  words: SessionWordWithWord[],
  recentAttempts: RecentAttemptsInput,
  optionWords: VocabWord[] = words.map((word) => word.vocab_word),
): StudyQuestion | null {
  return buildNextScheduledQuestion({
    chunkSize: FOREVER_REVIEW_CHUNK_SIZE,
    getQuestionType: (word) =>
      getNextUnsatisfiedMasteryQuestionType(word) ??
      getReviewQuestionType(session, word),
    getWordPriority: getForeverReviewWordPriority,
    isEligible: () => true,
    mode: "forever_review",
    optionWords,
    recentAttempts,
    session,
    words,
  });
}

function buildNextScheduledQuestion({
  chunkSize,
  getQuestionType,
  getWordPriority,
  isEligible,
  mode,
  optionWords,
  recentAttempts,
  session,
  words,
}: {
  chunkSize: number;
  getQuestionType: (word: SessionWordWithWord) => QuestionType | undefined;
  getWordPriority: (word: SessionWordWithWord) => number;
  isEligible: (word: SessionWordWithWord) => boolean;
  mode: SchedulerMode;
  optionWords: VocabWord[];
  recentAttempts: RecentAttemptsInput;
  session: StudySession;
  words: SessionWordWithWord[];
}) {
  const attempts = getRecentAttempts(recentAttempts);
  const activeWords = getActiveChunkWords({
    chunkSize,
    isEligible,
    mode,
    session,
    words,
  });
  const attemptStats = getWordAttemptStats(attempts);
  const combinations = activeWords.flatMap((word) => {
    if (!isEligible(word)) {
      return [];
    }

    const questionType = getQuestionType(word);

    return questionType
      ? [
          {
            word,
            questionType,
            score:
              getWordPriority(word) +
              getStagePriority(questionType) +
              getAttemptPriority(word, attemptStats),
          },
        ]
      : [];
  });

  const rankedCombinations = rankCombinations(combinations, attempts);

  const selected = rankedCombinations[0];

  if (!selected) {
    return null;
  }

  return createQuestion(
    selected.word,
    selected.questionType,
    words,
    optionWords,
    getQuestionSeed(session, selected.word, selected.questionType),
  );
}

function getActiveChunkWords({
  chunkSize,
  isEligible,
  mode,
  session,
  words,
}: {
  chunkSize: number;
  isEligible: (word: SessionWordWithWord) => boolean;
  mode: SchedulerMode;
  session: StudySession;
  words: SessionWordWithWord[];
}) {
  const chunks = getWordChunks(words, chunkSize);

  if (mode === "forever_review") {
    if (chunks.length === 0) {
      return [];
    }

    return chunks[getForeverReviewChunkIndex(session, chunks.length)] ?? [];
  }

  return chunks.find((chunk) => chunk.some(isEligible)) ?? [];
}

function getWordChunks(words: SessionWordWithWord[], chunkSize: number) {
  const orderedWords = [...words].sort(
    (first, second) => first.position - second.position,
  );
  const chunks: SessionWordWithWord[][] = [];

  for (let index = 0; index < orderedWords.length; index += chunkSize) {
    chunks.push(orderedWords.slice(index, index + chunkSize));
  }

  return chunks;
}

function getForeverReviewChunkIndex(session: StudySession, chunkCount: number) {
  return (
    Math.floor(session.total_questions_answered / FOREVER_REVIEW_CHUNK_SIZE) %
    chunkCount
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
    shaky: 160,
    stable: 45,
    recall_ready: 12,
  }[word.status];

  const attemptScore =
    word.miss_count * 45 + word.guessed_count * 32 - word.correct_count * 2;
  const freshnessScore = word.last_attempted_at ? 0 : 60;

  return statusScore + attemptScore + freshnessScore;
}

function getNextUnsatisfiedMasteryQuestionType(word: SessionWordWithWord) {
  if (!hasRecognitionMastery(word)) {
    return "meaning_recognition";
  }

  if (!word.satisfied_sat_usage) {
    return "sat_usage";
  }

  if (!word.satisfied_word_recall) {
    return "word_recall";
  }

  if (!word.satisfied_definition_recall) {
    return "definition_recall";
  }

  if (!word.satisfied_typed_reverse_recall) {
    return "typed_reverse_recall";
  }

  return undefined;
}

function hasRecognitionMastery(word: SessionWordWithWord) {
  return word.satisfied_meaning_recognition || word.satisfied_reverse_recall;
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

function getRecentAttempts(recentAttempts: RecentAttemptsInput) {
  if (!recentAttempts) {
    return [];
  }

  return (Array.isArray(recentAttempts) ? recentAttempts : [recentAttempts])
    .filter(Boolean)
    .sort((first, second) => second.created_at.localeCompare(first.created_at));
}

function getWordAttemptStats(recentAttempts: LatestAttempt[]) {
  const attemptsByWord = new Map<string, LatestAttempt[]>();

  recentAttempts.forEach((attempt) => {
    const wordAttempts = attemptsByWord.get(attempt.session_word_id) ?? [];
    wordAttempts.push(attempt);
    attemptsByWord.set(attempt.session_word_id, wordAttempts);
  });

  const stats = new Map<string, WordAttemptStats>();

  attemptsByWord.forEach((wordAttempts, sessionWordId) => {
    const lastFiveAttempts = wordAttempts.slice(0, 5);
    const weightedDifficulty = lastFiveAttempts.reduce((total, attempt, index) => {
      const weight = lastFiveAttempts.length - index;
      return total + getAttemptDifficulty(attempt) * weight;
    }, 0);
    const totalWeight = lastFiveAttempts.reduce(
      (total, _attempt, index) => total + lastFiveAttempts.length - index,
      0,
    );

    stats.set(sessionWordId, {
      difficultyScore:
        totalWeight > 0 ? Math.round((weightedDifficulty / totalWeight) * 140) : 0,
      lastAttemptIndex: recentAttempts.findIndex(
        (attempt) => attempt.session_word_id === sessionWordId,
      ),
    });
  });

  return stats;
}

function getAttemptDifficulty(attempt: LatestAttempt) {
  if (attempt.result === "incorrect") {
    return 1;
  }

  if (attempt.result === "unsure") {
    return 0.55;
  }

  return 0;
}

function getAttemptPriority(
  word: SessionWordWithWord,
  attemptStats: Map<string, WordAttemptStats>,
) {
  const stats = attemptStats.get(word.id);

  if (!stats) {
    return word.last_attempted_at ? 20 : 36;
  }

  return stats.difficultyScore + Math.min(stats.lastAttemptIndex * 16, 96);
}

function rankCombinations(
  combinations: QuestionCombination[],
  recentAttempts: LatestAttempt[],
) {
  const latestWordId = recentAttempts[0]?.session_word_id;
  const nonRepeatingCombinations =
    latestWordId && combinations.some((item) => item.word.id !== latestWordId)
      ? combinations.filter((item) => item.word.id !== latestWordId)
      : combinations;

  return nonRepeatingCombinations.sort((first, second) => {
    const firstScore = getAdjustedScore(first, recentAttempts);
    const secondScore = getAdjustedScore(second, recentAttempts);

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
}

function getAdjustedScore(
  combination: QuestionCombination,
  recentAttempts: LatestAttempt[],
) {
  const recentAttemptIndex = recentAttempts.findIndex(
    (attempt) => attempt.session_word_id === combination.word.id,
  );

  if (recentAttemptIndex === -1) {
    return combination.score;
  }

  const cooldownPenalty =
    recentAttemptIndex === 0 ? RECENT_WORD_COOLDOWN_COUNT * 40 : 0;
  const repeatedQuestionPenalty =
    recentAttempts[recentAttemptIndex]?.question_type ===
    combination.questionType
      ? 40
      : 0;

  return combination.score - cooldownPenalty - repeatedQuestionPenalty;
}

function createQuestion(
  target: SessionWordWithWord,
  questionType: QuestionType,
  words: SessionWordWithWord[],
  optionWords: VocabWord[],
  seed: string,
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

  if (questionType === "typed_reverse_recall") {
    return {
      answerMode: "typed",
      questionType,
      targetSessionWordId: target.id,
      targetVocabWordId: target.vocab_word_id,
      prompt: `Which word means "${target.vocab_word.fast_meaning}"?`,
      helperText: "Type the word.",
      options: [],
    };
  }

  const blankedPrompt = blankExampleSentence(
    target.vocab_word.word,
    target.vocab_word.fast_meaning,
    getExampleSentenceForQuestion(
      target.vocab_word.word,
      target.vocab_word.example_sentence,
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
  seed: string,
) {
  const sessionOptionWords = words.map((word) => word.vocab_word);
  const studiedDistractorCandidates = sessionOptionWords.filter(
    (word) => word.id !== target.vocab_word_id,
  );
  const studiedDistractors = random
    .clone(`${seed}:studied-distractors:${target.vocab_word_id}`)
    .sample(
      studiedDistractorCandidates,
      Math.min(2, studiedDistractorCandidates.length),
    );
  const studiedDistractorIds = new Set(studiedDistractors.map((word) => word.id));
  const fallbackDistractorCandidates = optionWords.filter(
    (word) =>
      word.id !== target.vocab_word_id && !studiedDistractorIds.has(word.id),
  );
  const fallbackDistractors = random
    .clone(`${seed}:fallback-distractors:${target.vocab_word_id}`)
    .sample(
      fallbackDistractorCandidates,
      Math.min(3 - studiedDistractors.length, fallbackDistractorCandidates.length),
    );

  const optionChoices = random
    .clone(`${seed}:option-order:${target.vocab_word_id}:${questionType}`)
    .shuffle([target.vocab_word, ...studiedDistractors, ...fallbackDistractors]);

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
) {
  const examples = getExampleSentences(exampleSentence);
  const pattern = getWordPattern(word);
  const blankableExamples = examples.filter((example) => pattern.test(example));
  const choices = blankableExamples.length > 0 ? blankableExamples : examples;

  return random.choice(choices) ?? "";
}

function getQuestionSeed(
  session: StudySession,
  word: SessionWordWithWord,
  questionType: QuestionType,
) {
  return [
    "study-question",
    session.id,
    session.total_questions_answered,
    word.id,
    word.vocab_word_id,
    questionType,
    word.correct_count,
    word.guessed_count,
    word.miss_count,
  ].join(":");
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

  if (overlapCount > 0) {
    return "correct";
  }

  return "incorrect";
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
