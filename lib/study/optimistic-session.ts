import {
  buildNextForeverReviewQuestion,
  buildNextQuestion,
  getReadyCount,
  gradeTypedAnswer,
  isRecallReady,
} from "@/lib/study/questions";
import type {
  AnswerConfidence,
  AnswerReviewGrade,
  CorrectionFeedback,
  CompletionReason,
  DailyWordStatus,
  DefinitionSelfGrade,
  ForeverReviewView,
  LatestAttempt,
  PendingAnswerReview,
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
  correction?: CorrectionFeedback;
  pendingGuess?: PendingGuess;
};

export type OptimisticForeverReviewAnswerResult = {
  nextView: ForeverReviewView;
  correction?: CorrectionFeedback;
  pendingGuess?: PendingGuess;
};

export type OptimisticAnswerReviewResult = {
  nextView: SessionView;
};

export type OptimisticForeverReviewAnswerReviewResult = {
  nextView: ForeverReviewView;
};

export function buildMultipleChoiceAnswerReview(
  view: QuestionView | ForeverReviewView,
  question: StudyQuestion,
  selectedVocabWordId: number,
  attemptId: string,
): PendingAnswerReview {
  const targetWord = getTargetWord(view, question.targetSessionWordId);

  return {
    answerMode: "multiple_choice",
    attemptId,
    question,
    selectedVocabWordId,
    selectedWord: getVocabWordById(view, selectedVocabWordId),
    systemGrade:
      selectedVocabWordId === question.targetVocabWordId
        ? "correct"
        : "incorrect",
    targetWord,
  };
}

export function buildTypedAnswerReview(
  view: QuestionView | ForeverReviewView,
  question: StudyQuestion,
  typedAnswer: string,
  attemptId: string,
): PendingAnswerReview {
  const targetWord = getTargetWord(view, question.targetSessionWordId);

  return {
    answerMode: "typed",
    attemptId,
    question,
    systemGrade: gradeTypedAnswer(
      question.questionType,
      targetWord.vocab_word,
      typedAnswer,
    ),
    targetWord,
    typedAnswer,
  };
}

export function applyOptimisticAnswerReview(
  view: QuestionView,
  review: PendingAnswerReview,
  grade: AnswerReviewGrade,
  reviewedAt: string,
): OptimisticAnswerReviewResult {
  const nextSession = incrementQuestionCount(view.session);
  const latestAttempt = getLatestAttempt(review.question, reviewedAt);
  const { words } = updateWord(view.words, review.targetWord.id, (word) =>
    applyReviewGrade(
      word,
      review.question.questionType,
      review.systemGrade,
      grade,
      reviewedAt,
    ),
  );

  return {
    nextView: buildPracticeView(
      nextSession,
      words,
      latestAttempt,
      reviewedAt,
      view.optionWords,
    ),
  };
}

export function applyOptimisticForeverReviewAnswerReview(
  view: ForeverReviewView,
  review: PendingAnswerReview,
  grade: AnswerReviewGrade,
  reviewedAt: string,
): OptimisticForeverReviewAnswerReviewResult {
  const nextSession = incrementQuestionCount(view.session);
  const latestAttempt = getLatestAttempt(review.question, reviewedAt);
  const targetWord = review.targetWord;
  const { updatedWord, words } = updateWord(view.words, targetWord.id, (word) =>
    applyReviewGrade(
      word,
      review.question.questionType,
      review.systemGrade,
      grade,
      reviewedAt,
    ),
  );
  const outcome = getReviewOutcome(review.systemGrade, grade);

  return {
    nextView: buildForeverReviewView(
      view,
      nextSession,
      words,
      latestAttempt,
      updateCheckpointAfterReview(
        view,
        targetWord,
        outcome,
        updatedWord.status === "recall_ready" &&
          targetWord.status !== "recall_ready",
      ),
    ),
  };
}

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
      correction: {
        answerMode: "multiple_choice",
        questionType: question.questionType,
        selectedWord: getVocabWordById(view, selectedVocabWordId),
        targetWord: updatedWord,
      },
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

export function applyOptimisticTypedAnswer(
  view: QuestionView,
  question: StudyQuestion,
  typedAnswer: string,
  answeredAt: string,
  selfGrade?: DefinitionSelfGrade,
): OptimisticAnswerResult {
  const targetWord = view.words.find(
    (word) => word.id === question.targetSessionWordId,
  );

  if (!targetWord) {
    throw new Error("Unable to find the active word.");
  }

  const nextSession = incrementQuestionCount(view.session);
  const latestAttempt = getLatestAttempt(question, answeredAt);
  const isCorrect = isTypedAnswerCorrect(
    question,
    targetWord,
    typedAnswer,
    selfGrade,
  );

  if (!isCorrect) {
    const { updatedWord, words } = updateWord(view.words, targetWord.id, (word) =>
      markMissed(word, question.questionType, answeredAt),
    );

    return {
      correction: {
        answerMode: "typed",
        questionType: question.questionType,
        targetWord: updatedWord,
        typedAnswer,
      },
      nextView: buildPracticeView(
        nextSession,
        words,
        latestAttempt,
        answeredAt,
        view.optionWords,
      ),
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

export function applyOptimisticForeverReviewAnswer(
  view: ForeverReviewView,
  question: StudyQuestion,
  selectedVocabWordId: number,
  attemptId: string,
  answeredAt: string,
): OptimisticForeverReviewAnswerResult {
  const targetWord = view.words.find(
    (word) => word.id === question.targetSessionWordId,
  );

  if (!targetWord) {
    throw new Error("Unable to find the active word.");
  }

  const nextSession = incrementQuestionCount(view.session);
  const latestAttempt = getLatestAttempt(question, answeredAt);
  const isCorrect = selectedVocabWordId === question.targetVocabWordId;
  const shouldAskGuess = isCorrect && question.questionType === "sat_usage";

  if (!isCorrect) {
    const { updatedWord, words } = updateWord(view.words, targetWord.id, (word) =>
      markMissed(word, question.questionType, answeredAt),
    );

    return {
      correction: {
        answerMode: "multiple_choice",
        questionType: question.questionType,
        selectedWord: getVocabWordById(view, selectedVocabWordId),
        targetWord: updatedWord,
      },
      nextView: buildForeverReviewView(
        view,
        nextSession,
        words,
        latestAttempt,
        updateCheckpointAfterAnswer(view, targetWord, "incorrect"),
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
        checkpoint: updateCheckpointAfterAnswer(view, targetWord, "correct"),
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

  const { updatedWord, words } = updateWord(view.words, targetWord.id, (word) =>
    creditKnown(word, question.questionType, answeredAt),
  );

  return {
    nextView: buildForeverReviewView(
      view,
      nextSession,
      words,
      latestAttempt,
      updateCheckpointAfterAnswer(
        view,
        targetWord,
        "correct",
        updatedWord.status === "recall_ready" &&
          targetWord.status !== "recall_ready",
      ),
    ),
  };
}

export function applyOptimisticForeverReviewTypedAnswer(
  view: ForeverReviewView,
  question: StudyQuestion,
  typedAnswer: string,
  answeredAt: string,
  selfGrade?: DefinitionSelfGrade,
): OptimisticForeverReviewAnswerResult {
  const targetWord = view.words.find(
    (word) => word.id === question.targetSessionWordId,
  );

  if (!targetWord) {
    throw new Error("Unable to find the active word.");
  }

  const nextSession = incrementQuestionCount(view.session);
  const latestAttempt = getLatestAttempt(question, answeredAt);
  const isCorrect = isTypedAnswerCorrect(
    question,
    targetWord,
    typedAnswer,
    selfGrade,
  );

  if (!isCorrect) {
    const { updatedWord, words } = updateWord(view.words, targetWord.id, (word) =>
      markMissed(word, question.questionType, answeredAt),
    );

    return {
      correction: {
        answerMode: "typed",
        questionType: question.questionType,
        targetWord: updatedWord,
        typedAnswer,
      },
      nextView: buildForeverReviewView(
        view,
        nextSession,
        words,
        latestAttempt,
        updateCheckpointAfterAnswer(view, targetWord, "incorrect"),
      ),
    };
  }

  const { updatedWord, words } = updateWord(view.words, targetWord.id, (word) =>
    creditKnown(word, question.questionType, answeredAt),
  );

  return {
    nextView: buildForeverReviewView(
      view,
      nextSession,
      words,
      latestAttempt,
      updateCheckpointAfterAnswer(
        view,
        targetWord,
        "correct",
        updatedWord.status === "recall_ready" &&
          targetWord.status !== "recall_ready",
      ),
    ),
  };
}

export function applyOptimisticForeverReviewGuess(
  view: ForeverReviewView,
  pendingGuess: PendingGuess,
  confidence: AnswerConfidence,
  guessedAt: string,
): ForeverReviewView {
  const targetWord = view.words.find(
    (word) => word.id === pendingGuess.sessionWordId,
  );

  if (!targetWord) {
    throw new Error("Unable to find the active word.");
  }

  const { updatedWord, words } = updateWord(
    view.words,
    pendingGuess.sessionWordId,
    (word) =>
      confidence === "guessed"
        ? markGuessed(word, "sat_usage", guessedAt)
        : creditKnown(word, "sat_usage", guessedAt),
  );

  return buildForeverReviewView(
    view,
    view.session,
    words,
    {
      created_at: guessedAt,
      question_type: "sat_usage",
      session_word_id: pendingGuess.sessionWordId,
    },
    updateCheckpointAfterGuess(
      view,
      targetWord,
      confidence,
      updatedWord.status === "recall_ready" && targetWord.status !== "recall_ready",
    ),
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

function buildForeverReviewView(
  view: ForeverReviewView,
  session: StudySession,
  words: SessionWordWithWord[],
  latestAttempt: LatestAttempt,
  checkpoint: ForeverReviewView["checkpoint"],
): ForeverReviewView {
  const question = buildNextForeverReviewQuestion(
    session,
    words,
    latestAttempt,
    view.optionWords,
  );

  if (!question) {
    throw new Error("Unable to build the next review question.");
  }

  return {
    ...view,
    checkpoint,
    question,
    readyCount: getReadyCount(words),
    session,
    totalWords: words.length,
    words,
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

function updateCheckpointAfterAnswer(
  view: ForeverReviewView,
  targetWord: SessionWordWithWord,
  outcome: "correct" | "incorrect",
  strengthened = false,
) {
  const wasAlreadyWeak =
    targetWord.miss_count > 0 ||
    targetWord.guessed_count > 0 ||
    targetWord.status === "shaky";

  return {
    correctCount:
      view.checkpoint.correctCount + (outcome === "correct" ? 1 : 0),
    questionsAnswered: view.checkpoint.questionsAnswered + 1,
    strengthenedCount:
      view.checkpoint.strengthenedCount + (strengthened ? 1 : 0),
    weakWordsFound:
      view.checkpoint.weakWordsFound +
      (outcome === "incorrect" && !wasAlreadyWeak ? 1 : 0),
  };
}

function updateCheckpointAfterGuess(
  view: ForeverReviewView,
  targetWord: SessionWordWithWord,
  confidence: AnswerConfidence,
  strengthened: boolean,
) {
  const wasAlreadyWeak =
    targetWord.miss_count > 0 ||
    targetWord.guessed_count > 0 ||
    targetWord.status === "shaky";

  return {
    ...view.checkpoint,
    strengthenedCount:
      view.checkpoint.strengthenedCount + (strengthened ? 1 : 0),
    weakWordsFound:
      view.checkpoint.weakWordsFound +
      (confidence === "guessed" && !wasAlreadyWeak ? 1 : 0),
  };
}

function updateCheckpointAfterReview(
  view: ForeverReviewView,
  targetWord: SessionWordWithWord,
  outcome: "correct" | "incorrect" | "unsure",
  strengthened: boolean,
) {
  const wasAlreadyWeak =
    targetWord.miss_count > 0 ||
    targetWord.guessed_count > 0 ||
    targetWord.status === "shaky";

  return {
    correctCount:
      view.checkpoint.correctCount + (outcome === "correct" ? 1 : 0),
    questionsAnswered: view.checkpoint.questionsAnswered + 1,
    strengthenedCount:
      view.checkpoint.strengthenedCount + (strengthened ? 1 : 0),
    weakWordsFound:
      view.checkpoint.weakWordsFound +
      (outcome !== "correct" && !wasAlreadyWeak ? 1 : 0),
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
  const wordIndex = words.findIndex((word) => word.id === sessionWordId);

  if (wordIndex === -1) {
    throw new Error("Unable to find the active word.");
  }

  const updatedWord = update(words[wordIndex]);
  const nextWords = words.map((word, index) =>
    index === wordIndex ? updatedWord : word,
  );

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

function applyReviewGrade(
  word: SessionWordWithWord,
  questionType: QuestionType,
  systemGrade: AnswerReviewGrade,
  grade: AnswerReviewGrade,
  attemptedAt: string,
) {
  const outcome = getReviewOutcome(systemGrade, grade);

  if (outcome === "correct") {
    return creditKnown(word, questionType, attemptedAt);
  }

  if (outcome === "unsure") {
    return markGuessed(word, questionType, attemptedAt);
  }

  return markMissed(word, questionType, attemptedAt);
}

function getReviewOutcome(
  systemGrade: AnswerReviewGrade,
  grade: AnswerReviewGrade,
): "correct" | "incorrect" | "unsure" {
  if (grade === "correct") {
    return "correct";
  }

  if (grade === "incorrect") {
    return "incorrect";
  }

  return systemGrade === "incorrect" ? "incorrect" : "unsure";
}

function getSatisfiedUpdate(questionType: QuestionType) {
  if (questionType === "meaning_recognition") {
    return { satisfied_meaning_recognition: true };
  }

  if (questionType === "reverse_recall") {
    return { satisfied_reverse_recall: true };
  }

  if (questionType === "sat_usage") {
    return { satisfied_sat_usage: true };
  }

  if (questionType === "word_recall") {
    return { satisfied_word_recall: true };
  }

  return { satisfied_definition_recall: true };
}

function getNextKnownStatus(word: SessionWordWithWord): DailyWordStatus {
  if (
    isRecallReady(word)
  ) {
    return "recall_ready";
  }

  return "stable";
}

function isTypedAnswerCorrect(
  question: StudyQuestion,
  targetWord: SessionWordWithWord,
  typedAnswer: string,
  selfGrade?: DefinitionSelfGrade,
) {
  if (selfGrade) {
    return selfGrade === "correct";
  }

  return (
    gradeTypedAnswer(
      question.questionType,
      targetWord.vocab_word,
      typedAnswer,
    ) === "correct"
  );
}

function getVocabWordById(
  view: QuestionView | ForeverReviewView,
  vocabWordId: number,
) {
  return (
    view.words.find((word) => word.vocab_word_id === vocabWordId)?.vocab_word ??
    view.optionWords.find((word) => word.id === vocabWordId)
  );
}

function getTargetWord(
  view: QuestionView | ForeverReviewView,
  sessionWordId: string,
) {
  const targetWord = view.words.find((word) => word.id === sessionWordId);

  if (!targetWord) {
    throw new Error("Unable to find the active word.");
  }

  return targetWord;
}
