import type {
  QuestionType,
  SessionWordSource,
  SessionWordWithWord,
  StudySession,
  VocabWord,
} from "@/lib/study/types";

export function vocabWord(overrides: Partial<VocabWord> = {}): VocabWord {
  const id = overrides.id ?? 1;
  const word = overrides.word ?? `word-${id}`;

  return {
    example_sentence:
      overrides.example_sentence ?? `The student used ${word} in a sentence.`,
    fast_meaning: overrides.fast_meaning ?? `meaning-${id}`,
    id,
    sort_order: overrides.sort_order ?? id,
    word,
  };
}

export function studySession(
  overrides: Partial<StudySession> = {},
): StudySession {
  return {
    completed_at: null,
    completion_reason: null,
    created_at: "2026-05-20T12:00:00.000Z",
    daily_word_count: 6,
    id: "session-1",
    learn_index: 0,
    phase: "practice",
    question_cap: 45,
    session_type: "daily",
    study_date: "2026-05-20",
    total_questions_answered: 0,
    updated_at: "2026-05-20T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

export function sessionWord(
  overrides: Partial<SessionWordWithWord> & {
    id?: string;
    source?: SessionWordSource;
    word?: Partial<VocabWord>;
  } = {},
): SessionWordWithWord {
  const id = overrides.id ?? "session-word-1";
  const word = vocabWord({
    id: overrides.vocab_word_id ?? 1,
    ...(overrides.word ?? {}),
  });

  return {
    correct_count: 0,
    created_at: "2026-05-20T12:00:00.000Z",
    guessed_count: 0,
    id,
    last_attempted_at: null,
    last_question_type: null,
    miss_count: 0,
    position: 0,
    satisfied_meaning_recognition: false,
    satisfied_reverse_recall: false,
    satisfied_sat_usage: false,
    session_id: "session-1",
    source: overrides.source ?? "new",
    status: "new",
    updated_at: "2026-05-20T12:00:00.000Z",
    user_id: "user-1",
    vocab_word: word,
    vocab_word_id: word.id,
    ...overrides,
  };
}

export function satisfiedWord(
  overrides: Partial<SessionWordWithWord> & {
    id?: string;
    word?: Partial<VocabWord>;
  } = {},
): SessionWordWithWord {
  return sessionWord({
    correct_count: 3,
    satisfied_meaning_recognition: true,
    satisfied_reverse_recall: true,
    satisfied_sat_usage: true,
    status: "recall_ready",
    ...overrides,
  });
}

export function unsatisfiedQuestionTypes(word: SessionWordWithWord) {
  const result: QuestionType[] = [];

  if (!word.satisfied_meaning_recognition) {
    result.push("meaning_recognition");
  }

  if (!word.satisfied_reverse_recall) {
    result.push("reverse_recall");
  }

  if (!word.satisfied_sat_usage) {
    result.push("sat_usage");
  }

  return result;
}
