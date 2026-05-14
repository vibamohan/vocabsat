export const QUESTION_TYPES = [
  "meaning_recognition",
  "reverse_recall",
  "sat_usage",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export type DailyWordStatus = "new" | "shaky" | "stable" | "recall_ready";

export type StudySessionPhase = "learn" | "practice" | "complete";

export type CompletionReason = "mastered" | "question_cap" | "manual";

export type AnswerConfidence = "known" | "guessed";

export type UserWordStatus = "learning" | "weak" | "recall_ready";

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
  status: DailyWordStatus;
  satisfied_meaning_recognition: boolean;
  satisfied_reverse_recall: boolean;
  satisfied_sat_usage: boolean;
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
  questionType: QuestionType;
  targetSessionWordId: string;
  targetVocabWordId: number;
  prompt: string;
  helperText: string;
  options: StudyQuestionOption[];
};

export type TodaySessionSummary =
  | {
      hasSession: false;
      availableWordCount: number;
      dailyWordCount: number;
      studyDate: string;
    }
  | {
      hasSession: true;
      studyDate: string;
      phase: StudySessionPhase;
      completed: boolean;
      completionReason: CompletionReason | null;
      readyCount: number;
      wordCount: number;
      questionCap: number;
      questionsAnswered: number;
      dailyWordCount: number;
    };

export type SessionStats = {
  learnedCount: number;
  readyCount: number;
  extraReviewCount: number;
  questionsAnswered: number;
};

export type SessionView =
  | {
      screen: "learn";
      session: StudySession;
      words: SessionWordWithWord[];
      currentWord: SessionWordWithWord;
      currentIndex: number;
      totalWords: number;
    }
  | {
      screen: "question";
      session: StudySession;
      words: SessionWordWithWord[];
      question: StudyQuestion;
      readyCount: number;
      totalWords: number;
    }
  | {
      screen: "complete";
      session: StudySession;
      words: SessionWordWithWord[];
      stats: SessionStats;
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
