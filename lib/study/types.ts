export const QUESTION_TYPES = [
  "meaning_recognition",
  "reverse_recall",
  "sat_usage",
  "word_recall",
  "definition_recall",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export type AnswerMode = "multiple_choice" | "typed";

export type DailyWordStatus = "new" | "shaky" | "stable" | "recall_ready";

export type StudySessionPhase = "learn" | "practice" | "complete";

export type CompletionReason = "mastered" | "question_cap" | "manual";

export type AnswerConfidence = "known" | "guessed";

export type AnswerReviewGrade = "correct" | "incorrect" | "unsure";

export type DefinitionSelfGrade = "correct" | "incorrect" | "unsure";

export type TypedAnswerGrade = "correct" | "incorrect" | "unsure";

export type UserWordStatus = "learning" | "weak" | "recall_ready";

export type SessionWordSource = "new" | "review";

export type StudySessionType = "daily" | "forever_review";

export type VocabWord = {
  id: number;
  word: string;
  fast_meaning: string;
  example_sentence: string;
  sort_order: number;
};

export type StudySession = {
  id: string;
  user_id: string;
  study_date: string;
  session_type: StudySessionType;
  phase: StudySessionPhase;
  daily_word_count: number;
  question_cap: number;
  learn_index: number;
  total_questions_answered: number;
  completed_at: string | null;
  completion_reason: CompletionReason | null;
  created_at: string;
  updated_at: string;
};

export type SessionWord = {
  id: string;
  session_id: string;
  user_id: string;
  vocab_word_id: number;
  position: number;
  source: SessionWordSource;
  status: DailyWordStatus;
  satisfied_meaning_recognition: boolean;
  satisfied_reverse_recall: boolean;
  satisfied_sat_usage: boolean;
  satisfied_word_recall: boolean;
  satisfied_definition_recall: boolean;
  correct_count: number;
  miss_count: number;
  guessed_count: number;
  last_question_type: QuestionType | null;
  last_attempted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionWordWithWord = SessionWord & {
  vocab_word: VocabWord;
};

export type LatestAttempt = {
  session_word_id: string;
  question_type: QuestionType;
  created_at: string;
};

export type StudyQuestionOption = {
  vocabWordId: number;
  label: string;
};

export type StudyQuestion = {
  answerMode: AnswerMode;
  questionType: QuestionType;
  targetSessionWordId: string;
  targetVocabWordId: number;
  prompt: string;
  helperText: string;
  options: StudyQuestionOption[];
};

export type CorrectionFeedback = {
  answerMode: AnswerMode;
  questionType: QuestionType;
  selectedWord?: VocabWord;
  targetWord: SessionWordWithWord;
  typedAnswer?: string;
};

export type PendingAnswerReview = {
  answerMode: AnswerMode;
  attemptId: string;
  question: StudyQuestion;
  selectedVocabWordId?: number;
  selectedWord?: VocabWord;
  systemGrade: AnswerReviewGrade;
  targetWord: SessionWordWithWord;
  typedAnswer?: string;
};

export type TodaySessionSummary =
  | {
      hasSession: false;
      availableWordCount: number;
      dailyWordCount: number;
      dueReviewCount: number;
      newWordCount: number;
      studyDate: string;
      weakDueCount: number;
    }
  | {
      hasSession: true;
      studyDate: string;
      phase: StudySessionPhase;
      completed: boolean;
      completionReason: CompletionReason | null;
      masteryProgressPercent: number;
      readyCount: number;
      wordCount: number;
      questionCap: number;
      questionsAnswered: number;
      dailyWordCount: number;
      dueReviewCount: number;
      newWordCount: number;
      reviewWordCount: number;
      weakDueCount: number;
    };

export type ForeverReviewSummary = {
  dueCount: number;
  eligibleWordCount: number;
  staleCount: number;
  studyDate: string;
  weakCount: number;
};

export type SessionStats = {
  extraReviewCount: number;
  learnedCount: number;
  newCount: number;
  questionsAnswered: number;
  readyCount: number;
  reviewCount: number;
  reviewReadyCount: number;
  weakCarryOverCount: number;
};

export type SessionView =
  | {
      screen: "learn";
      session: StudySession;
      learnWords: SessionWordWithWord[];
      words: SessionWordWithWord[];
      currentWord: SessionWordWithWord;
      currentIndex: number;
      totalWords: number;
    }
  | {
      screen: "question";
      session: StudySession;
      words: SessionWordWithWord[];
      optionWords: VocabWord[];
      question: StudyQuestion;
      readyCount: number;
      recentAttempts: LatestAttempt[];
      totalWords: number;
    }
  | {
      screen: "complete";
      session: StudySession;
      words: SessionWordWithWord[];
      stats: SessionStats;
    };

export type ForeverReviewCheckpoint = {
  correctCount: number;
  questionsAnswered: number;
  strengthenedCount: number;
  weakWordsFound: number;
};

export type ForeverReviewView = {
  checkpoint: ForeverReviewCheckpoint;
  mode: "forever_review";
  optionWords: VocabWord[];
  question: StudyQuestion;
  readyCount: number;
  recentAttempts: LatestAttempt[];
  screen: "question";
  session: StudySession;
  totalWords: number;
  words: SessionWordWithWord[];
};

export type PendingGuess = {
  attemptId: string;
  sessionWordId: string;
  word: VocabWord;
};

export type SubmitAnswerResult =
  | {
      outcome: "incorrect";
      sessionWordId: string;
    }
  | {
      outcome: "guess_check";
      attemptId: string;
    }
  | {
      outcome: "continue";
    };
