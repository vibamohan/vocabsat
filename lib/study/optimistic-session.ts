import {
  buildNextQuestion,
  getReadyCount,
  isQuestionTypeSatisfied,
  isRecallReady,
} from "@/lib/study/questions";
import type {
  AnswerConfidence,
  CompletionReason,
  DailyWordStatus,
  LatestAttempt,
  PendingGuess,
  QuestionType,
  SessionStats,
  SessionView,
  SessionWordWithWord,
  StudyQuestion,
  StudySession,
} from "@/lib/study/types";

type QuestionView = Extract<SessionView, { screen: "question" }>;

export type OptimisticAnswerResult = {
  nextView: SessionView;
  correctionWord?: SessionWordWithWord;
  pendingGuess?: PendingGuess;
};

export function applyOptimisticAnswer(
  view: QuestionView,
  question: StudyQuestion,
  selectedVocabWordId: number,
  attemptId: string,
  answeredAt: string,
): OptimisticAnswerResult {
  const targetWord = view.words.find(
    (word) => word.id === question.targetSessionWordId,
  );

  if (!targetWord) {
    throw new Error("Unable to find the active word.");
  }

  const nextSession = incrementQuestionCount(view.session);
  const latestAttempt = getLatestAttempt(question, answeredAt);
  const isCorrect = selectedVocabWordId === question.targetVocabWordId;
  const shouldAskGuess =
    isCorrect &&
    question.questionType === "sat_usage" &&
    !targetWord.satisfied_sat_usage;

  if (!isCorrect) {
    const { updatedWord, words } = updateWord(view.words, targetWord.id, (word) =>
      markMissed(word, question.questionType, answeredAt),
    );

    return {
      correctionWord: updatedWord,
      nextView: buildPracticeView(
        nextSession,
        words,
        latestAttempt,
        answeredAt,
        view.optionWords,
      ),
    };
  }

  if (shouldAskGuess) {
    const { updatedWord, words } = updateWord(view.words, targetWord.id, (word) =>
      touchAttempt(word, question.questionType, answeredAt),
    );

    return {
      nextView: {
        ...view,
        session: nextSession,
        words,
      },
      pendingGuess: {
        attemptId,
        sessionWordId: updatedWord.id,
        word: updatedWord.vocab_word,
      },
    };
  }

  const { words } = updateWord(view.words, targetWord.id, (word) =>
    creditKnown(word, question.questionType, answeredAt),
  );

  return {
    nextView: buildPracticeView(
      nextSession,
      words,
      latestAttempt,
      answeredAt,
      view.optionWords,
    ),
  };
}

export function applyOptimisticGuess(
  view: QuestionView,
  pendingGuess: PendingGuess,
  confidence: AnswerConfidence,
  guessedAt: string,
): SessionView {
  const { words } = updateWord(view.words, pendingGuess.sessionWordId, (word) =>
    confidence === "guessed"
      ? markGuessed(word, "sat_usage", guessedAt)
      : creditKnown(word, "sat_usage", guessedAt),
  );

  return buildPracticeView(
    view.session,
    words,
    {
      created_at: guessedAt,
      question_type: "sat_usage",
      session_word_id: pendingGuess.sessionWordId,
    },
    guessedAt,
    view.optionWords,
  );
}

function incrementQuestionCount(session: StudySession): StudySession {
  return {
    ...session,
    total_questions_answered: session.total_questions_answered + 1,
  };
}

function getLatestAttempt(
  question: StudyQuestion,
  createdAt: string,
): LatestAttempt {
  return {
    created_at: createdAt,
    question_type: question.questionType,
    session_word_id: question.targetSessionWordId,
  };
}

function buildPracticeView(
  session: StudySession,
  words: SessionWordWithWord[],
  latestAttempt: LatestAttempt,
  completedAt: string,
  optionWords: QuestionView["optionWords"],
): SessionView {
  const completionReason = getCompletionReason(session, words);

  if (completionReason) {
    const completedSession = completeSession(
      session,
      completionReason,
      completedAt,
    );

    return {
      screen: "complete",
      session: completedSession,
      stats: getSessionStats(completedSession, words),
      words,
    };
  }

  const question = buildNextQuestion(session, words, latestAttempt, optionWords);

  if (!question) {
    const completedSession = completeSession(session, "mastered", completedAt);

    return {
      screen: "complete",
      session: completedSession,
      stats: getSessionStats(completedSession, words),
      words,
    };
  }

  return {
    screen: "question",
    optionWords,
    question,
    readyCount: getReadyCount(words),
    session,
    totalWords: words.length,
    words,
  };
}

function getCompletionReason(
  session: StudySession,
  words: SessionWordWithWord[],
): CompletionReason | null {
  if (words.length > 0 && words.every(isRecallReady)) {
    return "mastered";
  }

  if (session.total_questions_answered >= session.question_cap) {
    return "question_cap";
  }

  return null;
}

function completeSession(
  session: StudySession,
  completionReason: CompletionReason,
  completedAt: string,
): StudySession {
  return {
    ...session,
    completed_at: completedAt,
    completion_reason: completionReason,
    phase: "complete",
  };
}

function getSessionStats(
  session: StudySession,
  words: SessionWordWithWord[],
): SessionStats {
  const reviewWords = words.filter((word) => word.source === "review");

  return {
    extraReviewCount: words.filter(
      (word) => word.miss_count > 0 || word.guessed_count > 0,
    ).length,
    learnedCount: words.length,
    newCount: words.filter((word) => word.source === "new").length,
    questionsAnswered: session.total_questions_answered,
    readyCount: getReadyCount(words),
    reviewCount: reviewWords.length,
    reviewReadyCount: reviewWords.filter(isRecallReady).length,
    weakCarryOverCount: words.filter(
      (word) =>
        word.status !== "recall_ready" &&
        (word.miss_count > 0 ||
          word.guessed_count > 0 ||
          word.status === "shaky"),
    ).length,
  };
}

function updateWord(
  words: SessionWordWithWord[],
  sessionWordId: string,
  update: (word: SessionWordWithWord) => SessionWordWithWord,
) {
  let updatedWord: SessionWordWithWord | null = null;
  const nextWords = words.map((word) => {
    if (word.id !== sessionWordId) {
      return word;
    }

    const nextWord = update(word);
    updatedWord = nextWord;
    return nextWord;
  });

  if (!updatedWord) {
    throw new Error("Unable to find the active word.");
  }

  return { updatedWord, words: nextWords };
}

function markMissed(
  word: SessionWordWithWord,
  questionType: QuestionType,
  attemptedAt: string,
): SessionWordWithWord {
  return {
    ...word,
    last_attempted_at: attemptedAt,
    last_question_type: questionType,
    miss_count: word.miss_count + 1,
    status: "shaky",
  };
}

function markGuessed(
  word: SessionWordWithWord,
  questionType: QuestionType,
  attemptedAt: string,
): SessionWordWithWord {
  return {
    ...word,
    guessed_count: word.guessed_count + 1,
    last_attempted_at: attemptedAt,
    last_question_type: questionType,
    status: "shaky",
  };
}

function touchAttempt(
  word: SessionWordWithWord,
  questionType: QuestionType,
  attemptedAt: string,
): SessionWordWithWord {
  return {
    ...word,
    last_attempted_at: attemptedAt,
    last_question_type: questionType,
  };
}

function creditKnown(
  word: SessionWordWithWord,
  questionType: QuestionType,
  attemptedAt: string,
): SessionWordWithWord {
  const nextWord = {
    ...word,
    ...getSatisfiedUpdate(questionType),
    correct_count: word.correct_count + 1,
    last_attempted_at: attemptedAt,
    last_question_type: questionType,
  };

  return {
    ...nextWord,
    status: getNextKnownStatus(nextWord),
  };
}

function getSatisfiedUpdate(questionType: QuestionType) {
  if (questionType === "meaning_recognition") {
    return { satisfied_meaning_recognition: true };
  }

  if (questionType === "reverse_recall") {
    return { satisfied_reverse_recall: true };
  }

  return { satisfied_sat_usage: true };
}

function getNextKnownStatus(word: SessionWordWithWord): DailyWordStatus {
  if (
    isQuestionTypeSatisfied(word, "meaning_recognition") &&
    isQuestionTypeSatisfied(word, "reverse_recall") &&
    isQuestionTypeSatisfied(word, "sat_usage")
  ) {
    return "recall_ready";
  }

  return "stable";
}
