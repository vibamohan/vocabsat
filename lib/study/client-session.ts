"use client";

import { getDailyWordCount, QUESTION_CAP } from "@/lib/study/config";
import { getStudyDate } from "@/lib/study/dates";
import {
  buildNextQuestion,
  getReadyCount,
  isQuestionTypeSatisfied,
  isRecallReady,
} from "@/lib/study/questions";
import type {
  AnswerConfidence,
  DailyWordStatus,
  LatestAttempt,
  PendingGuess,
  QuestionType,
  SessionStats,
  SessionView,
  SessionWordWithWord,
  StudySession,
  SubmitAnswerResult,
  TodaySessionSummary,
  UserWordStatus,
  VocabWord,
} from "@/lib/study/types";
import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

type MasteryRow = {
  user_id: string;
  vocab_word_id: number;
  status: UserWordStatus;
  correct_count: number;
  miss_count: number;
  guessed_count: number;
  last_seen_at: string | null;
  last_ready_at: string | null;
};

type AttemptRow = {
  id: string;
  session_id: string;
  session_word_id: string;
  user_id: string;
  vocab_word_id: number;
  question_type: QuestionType;
  selected_vocab_word_id: number;
  is_correct: boolean;
  confidence: AnswerConfidence | null;
  created_at: string;
};

type SubmitAnswerInput = {
  sessionWordId: string;
  questionType: QuestionType;
  selectedVocabWordId: number;
};

export async function getCurrentUser(supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  assertNoError(error, "Unable to load the current user");
  return user;
}

export async function getTodaySessionSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<TodaySessionSummary> {
  const studyDate = getStudyDate();
  const dailyWordCount = getDailyWordCount();
  const session = await getSessionForDate(supabase, userId, studyDate);

  if (!session) {
    const { count, error } = await supabase
      .from("vocab_words")
      .select("id", { count: "exact", head: true });

    assertNoError(error, "Unable to count seeded vocabulary words");

    return {
      hasSession: false,
      availableWordCount: count ?? 0,
      dailyWordCount,
      studyDate,
    };
  }

  const words = await getSessionWords(supabase, userId, session.id);

  return {
    hasSession: true,
    completed: session.phase === "complete",
    completionReason: session.completion_reason,
    dailyWordCount: session.daily_word_count,
    phase: session.phase,
    questionCap: session.question_cap,
    questionsAnswered: session.total_questions_answered,
    readyCount: getReadyCount(words),
    studyDate,
    wordCount: words.length,
  };
}

export async function startOrContinueTodaySession(
  supabase: SupabaseClient,
  userId: string,
) {
  const studyDate = getStudyDate();
  const existingSession = await getSessionForDate(supabase, userId, studyDate);

  if (existingSession) {
    return existingSession;
  }

  const dailyWordCount = getDailyWordCount();
  const selectedWords = await selectWordsForToday(
    supabase,
    userId,
    dailyWordCount,
  );

  if (selectedWords.length < dailyWordCount) {
    throw new Error(
      `Seed at least ${dailyWordCount} vocabulary words before starting a session.`,
    );
  }

  const { data: insertedSession, error: sessionError } = await supabase
    .from("study_sessions")
    .insert({
      daily_word_count: dailyWordCount,
      phase: "learn",
      question_cap: QUESTION_CAP,
      study_date: studyDate,
      user_id: userId,
    })
    .select("*")
    .single();

  if (sessionError?.code === "23505") {
    const racedSession = await getSessionForDate(supabase, userId, studyDate);

    if (racedSession) {
      return racedSession;
    }
  }

  const session = requireRow<StudySession>(
    insertedSession,
    sessionError,
    "Unable to create today's session",
  );

  const sessionWords = selectedWords.map((word, index) => ({
    position: index,
    session_id: session.id,
    user_id: userId,
    vocab_word_id: word.id,
  }));

  const { error: wordsError } = await supabase
    .from("study_session_words")
    .insert(sessionWords);

  assertNoError(wordsError, "Unable to attach words to today's session");
  await markWordsSeen(supabase, userId, selectedWords);

  return session;
}

export async function getSessionView(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionView> {
  let session = await startOrContinueTodaySession(supabase, userId);
  let words = await getSessionWords(supabase, userId, session.id);

  if (session.phase === "learn" && session.learn_index >= words.length) {
    session = await updateSessionPhase(supabase, userId, session.id, "practice");
  }

  const reconciledSession = await reconcileCompletion(
    supabase,
    userId,
    session,
    words,
  );

  if (
    reconciledSession.id !== session.id ||
    reconciledSession.phase !== session.phase
  ) {
    session = reconciledSession;
    words = await getSessionWords(supabase, userId, session.id);
  } else {
    session = reconciledSession;
  }

  return buildSessionView(supabase, userId, session, words);
}

export async function advanceLearn(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
  words: SessionWordWithWord[],
) {
  const nextIndex = Math.min(session.learn_index + 1, words.length);
  const nextPhase = nextIndex >= words.length ? "practice" : "learn";

  const { error } = await supabase
    .from("study_sessions")
    .update({
      learn_index: nextIndex,
      phase: nextPhase,
    })
    .eq("id", session.id)
    .eq("user_id", userId);

  assertNoError(error, "Unable to advance the learn card");
}

export async function submitAnswer(
  supabase: SupabaseClient,
  userId: string,
  input: SubmitAnswerInput,
): Promise<SubmitAnswerResult> {
  const sessionWord = await getSessionWordById(
    supabase,
    userId,
    input.sessionWordId,
  );
  const session = await getSessionById(supabase, userId, sessionWord.session_id);

  if (session.phase === "complete") {
    return { outcome: "continue" };
  }

  if (session.phase !== "practice") {
    throw new Error("This session is not ready for practice yet.");
  }

  const words = await getSessionWords(supabase, userId, session.id);
  const latestAttempt = await getLatestAttempt(supabase, session.id);
  const currentQuestion = buildNextQuestion(session, words, latestAttempt);

  if (
    !currentQuestion ||
    currentQuestion.targetSessionWordId !== input.sessionWordId ||
    currentQuestion.questionType !== input.questionType ||
    !currentQuestion.options.some(
      (option) => option.vocabWordId === input.selectedVocabWordId,
    )
  ) {
    throw new Error("This answer no longer matches the active question.");
  }

  const isCorrect = input.selectedVocabWordId === sessionWord.vocab_word_id;
  const shouldAskGuess =
    isCorrect &&
    input.questionType === "sat_usage" &&
    !sessionWord.satisfied_sat_usage;

  const { data: insertedAttempt, error: attemptError } = await supabase
    .from("study_question_attempts")
    .insert({
      confidence: isCorrect && !shouldAskGuess ? "known" : null,
      is_correct: isCorrect,
      question_type: input.questionType,
      selected_vocab_word_id: input.selectedVocabWordId,
      session_id: session.id,
      session_word_id: sessionWord.id,
      user_id: userId,
      vocab_word_id: sessionWord.vocab_word_id,
    })
    .select("*")
    .single();

  const attempt = requireRow<AttemptRow>(
    insertedAttempt,
    attemptError,
    "Unable to record the answer",
  );

  await incrementSessionQuestionCount(supabase, userId, session);

  if (!isCorrect) {
    await markWordMissed(supabase, userId, sessionWord, input.questionType);
    await reconcileCompletionAfterAttempt(supabase, userId, session.id);

    return {
      outcome: "incorrect",
      sessionWordId: sessionWord.id,
    };
  }

  if (shouldAskGuess) {
    await touchSessionWordAttempt(
      supabase,
      userId,
      sessionWord,
      input.questionType,
    );

    return {
      outcome: "guess_check",
      attemptId: attempt.id,
    };
  }

  await creditKnownAnswer(supabase, userId, sessionWord, input.questionType);
  await reconcileCompletionAfterAttempt(supabase, userId, session.id);

  return { outcome: "continue" };
}

export async function recordGuess(
  supabase: SupabaseClient,
  userId: string,
  attemptId: string,
  confidence: AnswerConfidence,
) {
  const attempt = await getAttemptById(supabase, userId, attemptId);

  if (
    !attempt.is_correct ||
    attempt.question_type !== "sat_usage" ||
    attempt.confidence
  ) {
    return;
  }

  const sessionWord = await getSessionWordById(
    supabase,
    userId,
    attempt.session_word_id,
  );

  const { error: attemptError } = await supabase
    .from("study_question_attempts")
    .update({ confidence })
    .eq("id", attempt.id)
    .eq("user_id", userId);

  assertNoError(attemptError, "Unable to save the guess check");

  if (confidence === "guessed") {
    await markWordGuessed(supabase, userId, sessionWord, "sat_usage");
  } else {
    await creditKnownAnswer(supabase, userId, sessionWord, "sat_usage");
  }

  await reconcileCompletionAfterAttempt(supabase, userId, attempt.session_id);
}

export async function resetTodaySession(
  supabase: SupabaseClient,
  userId: string,
) {
  const session = await getSessionForDate(supabase, userId, getStudyDate());

  if (!session) {
    return;
  }

  const words = await getSessionWords(supabase, userId, session.id);
  const now = new Date().toISOString();

  const { error: attemptsError } = await supabase
    .from("study_question_attempts")
    .delete()
    .eq("session_id", session.id)
    .eq("user_id", userId);

  assertNoError(attemptsError, "Unable to clear session attempts");

  const { error: sessionWordsError } = await supabase
    .from("study_session_words")
    .update({
      correct_count: 0,
      guessed_count: 0,
      last_attempted_at: null,
      last_question_type: null,
      miss_count: 0,
      satisfied_meaning_recognition: false,
      satisfied_reverse_recall: false,
      satisfied_sat_usage: false,
      status: "new",
    })
    .eq("session_id", session.id)
    .eq("user_id", userId);

  assertNoError(sessionWordsError, "Unable to reset session words");

  const { error: sessionError } = await supabase
    .from("study_sessions")
    .update({
      completed_at: null,
      completion_reason: null,
      learn_index: 0,
      phase: "learn",
      total_questions_answered: 0,
    })
    .eq("id", session.id)
    .eq("user_id", userId);

  assertNoError(sessionError, "Unable to reset today's session");

  if (words.length === 0) {
    return;
  }

  const { error: masteryError } = await supabase
    .from("user_word_mastery")
    .update({
      last_ready_at: null,
      last_seen_at: now,
      status: "learning",
    })
    .eq("user_id", userId)
    .in(
      "vocab_word_id",
      words.map((word) => word.vocab_word_id),
    );

  assertNoError(masteryError, "Unable to reset word mastery status");
}

export async function getCorrectionWord(
  supabase: SupabaseClient,
  userId: string,
  sessionWordId: string,
) {
  return getSessionWordById(supabase, userId, sessionWordId);
}

export async function getPendingGuess(
  supabase: SupabaseClient,
  userId: string,
  attemptId: string,
): Promise<PendingGuess | null> {
  const attempt = await getAttemptById(supabase, userId, attemptId);

  if (
    !attempt.is_correct ||
    attempt.question_type !== "sat_usage" ||
    attempt.confidence
  ) {
    return null;
  }

  const sessionWord = await getSessionWordById(
    supabase,
    userId,
    attempt.session_word_id,
  );

  return {
    attemptId: attempt.id,
    sessionWordId: sessionWord.id,
    word: sessionWord.vocab_word,
  };
}

async function buildSessionView(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
  words: SessionWordWithWord[],
): Promise<SessionView> {
  if (session.phase === "complete") {
    return {
      screen: "complete",
      session,
      stats: getSessionStats(session, words),
      words,
    };
  }

  if (session.phase === "learn") {
    const currentWord = words[session.learn_index];

    if (currentWord) {
      return {
        screen: "learn",
        currentIndex: session.learn_index,
        currentWord,
        session,
        totalWords: words.length,
        words,
      };
    }

    const practiceSession = await updateSessionPhase(
      supabase,
      userId,
      session.id,
      "practice",
    );

    return buildSessionView(supabase, userId, practiceSession, words);
  }

  const latestAttempt = await getLatestAttempt(supabase, session.id);
  const question = buildNextQuestion(session, words, latestAttempt);

  if (!question) {
    const completedSession = await completeSession(
      supabase,
      userId,
      session,
      "mastered",
    );

    return {
      screen: "complete",
      session: completedSession,
      stats: getSessionStats(completedSession, words),
      words,
    };
  }

  return {
    screen: "question",
    question,
    readyCount: getReadyCount(words),
    session,
    totalWords: words.length,
    words,
  };
}

async function getSessionForDate(
  supabase: SupabaseClient,
  userId: string,
  studyDate: string,
) {
  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("study_date", studyDate)
    .maybeSingle();

  assertNoError(error, "Unable to load today's session");

  return data as StudySession | null;
}

async function getSessionById(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  return requireRow<StudySession>(data, error, "Unable to load the session");
}

async function getSessionWords(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from("study_session_words")
    .select(
      `
        *,
        vocab_word:vocab_words (
          id,
          word,
          fast_meaning,
          example_sentence,
          sort_order
        )
      `,
    )
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("position", { ascending: true });

  assertNoError(error, "Unable to load session words");

  return (data ?? []) as SessionWordWithWord[];
}

async function getSessionWordById(
  supabase: SupabaseClient,
  userId: string,
  sessionWordId: string,
) {
  const { data, error } = await supabase
    .from("study_session_words")
    .select(
      `
        *,
        vocab_word:vocab_words (
          id,
          word,
          fast_meaning,
          example_sentence,
          sort_order
        )
      `,
    )
    .eq("id", sessionWordId)
    .eq("user_id", userId)
    .single();

  return requireRow<SessionWordWithWord>(
    data,
    error,
    "Unable to load the session word",
  );
}

async function getAttemptById(
  supabase: SupabaseClient,
  userId: string,
  attemptId: string,
) {
  const { data, error } = await supabase
    .from("study_question_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .single();

  return requireRow<AttemptRow>(data, error, "Unable to load the attempt");
}

async function getLatestAttempt(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<LatestAttempt | null> {
  const { data, error } = await supabase
    .from("study_question_attempts")
    .select("session_word_id, question_type, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  assertNoError(error, "Unable to load the latest attempt");

  return data as LatestAttempt | null;
}

async function selectWordsForToday(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
) {
  const [
    { data: masteryData, error: masteryError },
    { data: wordData, error: wordError },
  ] = await Promise.all([
    supabase
      .from("user_word_mastery")
      .select(
        "user_id, vocab_word_id, status, correct_count, miss_count, guessed_count, last_seen_at, last_ready_at",
      )
      .eq("user_id", userId),
    supabase
      .from("vocab_words")
      .select("id, word, fast_meaning, example_sentence, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  assertNoError(masteryError, "Unable to load prior word mastery");
  assertNoError(wordError, "Unable to load vocabulary words");

  const masteryRows = (masteryData ?? []) as MasteryRow[];
  const words = (wordData ?? []) as VocabWord[];
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const seenWordIds = new Set(masteryRows.map((row) => row.vocab_word_id));
  const selected = new Map<number, VocabWord>();

  masteryRows
    .filter((row) => row.status === "weak" || row.status === "learning")
    .sort((first, second) => {
      const firstScore = getMasteryPriority(first);
      const secondScore = getMasteryPriority(second);

      if (firstScore !== secondScore) {
        return secondScore - firstScore;
      }

      return (first.last_seen_at ?? "").localeCompare(second.last_seen_at ?? "");
    })
    .forEach((row) => {
      const word = wordsById.get(row.vocab_word_id);

      if (word && selected.size < limit) {
        selected.set(word.id, word);
      }
    });

  for (const word of words) {
    if (selected.size >= limit) {
      break;
    }

    if (!seenWordIds.has(word.id)) {
      selected.set(word.id, word);
    }
  }

  for (const word of words) {
    if (selected.size >= limit) {
      break;
    }

    selected.set(word.id, word);
  }

  return Array.from(selected.values()).slice(0, limit);
}

function getMasteryPriority(row: MasteryRow) {
  const statusScore = row.status === "weak" ? 100 : 50;
  return (
    statusScore + row.miss_count * 8 + row.guessed_count * 6 - row.correct_count
  );
}

async function markWordsSeen(
  supabase: SupabaseClient,
  userId: string,
  words: VocabWord[],
) {
  const now = new Date().toISOString();
  const wordIds = words.map((word) => word.id);
  const { data, error } = await supabase
    .from("user_word_mastery")
    .select(
      "user_id, vocab_word_id, status, correct_count, miss_count, guessed_count, last_seen_at, last_ready_at",
    )
    .eq("user_id", userId)
    .in("vocab_word_id", wordIds);

  assertNoError(error, "Unable to load selected word mastery");

  const existingRows = new Map(
    ((data ?? []) as MasteryRow[]).map((row) => [row.vocab_word_id, row]),
  );

  const rows = words.map((word) => {
    const existing = existingRows.get(word.id);

    return {
      last_seen_at: now,
      status: existing?.status === "weak" ? "weak" : "learning",
      user_id: userId,
      vocab_word_id: word.id,
    };
  });

  const { error: upsertError } = await supabase
    .from("user_word_mastery")
    .upsert(rows, { onConflict: "user_id,vocab_word_id" });

  assertNoError(upsertError, "Unable to mark selected words as seen");
}

async function updateSessionPhase(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  phase: "practice",
) {
  const { data, error } = await supabase
    .from("study_sessions")
    .update({ phase })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("*")
    .single();

  return requireRow<StudySession>(data, error, "Unable to update session phase");
}

async function incrementSessionQuestionCount(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
) {
  const { error } = await supabase
    .from("study_sessions")
    .update({
      total_questions_answered: session.total_questions_answered + 1,
    })
    .eq("id", session.id)
    .eq("user_id", userId);

  assertNoError(error, "Unable to update question count");
}

async function markWordMissed(
  supabase: SupabaseClient,
  userId: string,
  word: SessionWordWithWord,
  questionType: QuestionType,
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("study_session_words")
    .update({
      last_attempted_at: now,
      last_question_type: questionType,
      miss_count: word.miss_count + 1,
      status: "shaky",
    })
    .eq("id", word.id)
    .eq("user_id", userId);

  assertNoError(error, "Unable to update the missed word");
  await updateMasteryAfterAttempt(supabase, userId, word.vocab_word_id, {
    guessed: false,
    isCorrect: false,
    isRecallReady: false,
  });
}

async function markWordGuessed(
  supabase: SupabaseClient,
  userId: string,
  word: SessionWordWithWord,
  questionType: QuestionType,
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("study_session_words")
    .update({
      guessed_count: word.guessed_count + 1,
      last_attempted_at: now,
      last_question_type: questionType,
      status: "shaky",
    })
    .eq("id", word.id)
    .eq("user_id", userId);

  assertNoError(error, "Unable to update the guessed word");
  await updateMasteryAfterAttempt(supabase, userId, word.vocab_word_id, {
    guessed: true,
    isCorrect: true,
    isRecallReady: false,
  });
}

async function touchSessionWordAttempt(
  supabase: SupabaseClient,
  userId: string,
  word: SessionWordWithWord,
  questionType: QuestionType,
) {
  const { error } = await supabase
    .from("study_session_words")
    .update({
      last_attempted_at: new Date().toISOString(),
      last_question_type: questionType,
    })
    .eq("id", word.id)
    .eq("user_id", userId);

  assertNoError(error, "Unable to update the attempted word");
}

async function creditKnownAnswer(
  supabase: SupabaseClient,
  userId: string,
  word: SessionWordWithWord,
  questionType: QuestionType,
) {
  const now = new Date().toISOString();
  const satisfiedUpdates = getSatisfiedUpdate(questionType);
  const nextWord = {
    ...word,
    ...satisfiedUpdates,
  };
  const nextStatus = getNextKnownStatus(nextWord);
  const { error } = await supabase
    .from("study_session_words")
    .update({
      ...satisfiedUpdates,
      correct_count: word.correct_count + 1,
      last_attempted_at: now,
      last_question_type: questionType,
      status: nextStatus,
    })
    .eq("id", word.id)
    .eq("user_id", userId);

  assertNoError(error, "Unable to credit the known answer");
  await updateMasteryAfterAttempt(supabase, userId, word.vocab_word_id, {
    guessed: false,
    isCorrect: true,
    isRecallReady: nextStatus === "recall_ready",
  });
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

async function updateMasteryAfterAttempt(
  supabase: SupabaseClient,
  userId: string,
  vocabWordId: number,
  result: {
    isCorrect: boolean;
    guessed: boolean;
    isRecallReady: boolean;
  },
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("user_word_mastery")
    .select(
      "user_id, vocab_word_id, status, correct_count, miss_count, guessed_count, last_seen_at, last_ready_at",
    )
    .eq("user_id", userId)
    .eq("vocab_word_id", vocabWordId)
    .maybeSingle();

  assertNoError(error, "Unable to load word mastery");

  const existing = data as MasteryRow | null;
  const nextStatus: UserWordStatus = result.isRecallReady
    ? "recall_ready"
    : result.isCorrect && !result.guessed
      ? "learning"
      : "weak";

  const { error: upsertError } = await supabase
    .from("user_word_mastery")
    .upsert(
      {
        correct_count:
          (existing?.correct_count ?? 0) + (result.isCorrect ? 1 : 0),
        guessed_count:
          (existing?.guessed_count ?? 0) + (result.guessed ? 1 : 0),
        last_ready_at: result.isRecallReady ? now : existing?.last_ready_at ?? null,
        last_seen_at: now,
        miss_count: (existing?.miss_count ?? 0) + (result.isCorrect ? 0 : 1),
        status: nextStatus,
        user_id: userId,
        vocab_word_id: vocabWordId,
      },
      { onConflict: "user_id,vocab_word_id" },
    );

  assertNoError(upsertError, "Unable to update word mastery");
}

async function reconcileCompletionAfterAttempt(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const session = await getSessionById(supabase, userId, sessionId);
  const words = await getSessionWords(supabase, userId, sessionId);
  await reconcileCompletion(supabase, userId, session, words);
}

async function reconcileCompletion(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
  words: SessionWordWithWord[],
) {
  if (session.phase === "complete") {
    return session;
  }

  if (words.length > 0 && words.every(isRecallReady)) {
    return completeSession(supabase, userId, session, "mastered");
  }

  if (session.total_questions_answered >= session.question_cap) {
    return completeSession(supabase, userId, session, "question_cap");
  }

  return session;
}

async function completeSession(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
  reason: "mastered" | "question_cap",
) {
  if (session.phase === "complete") {
    return session;
  }

  const { data, error } = await supabase
    .from("study_sessions")
    .update({
      completed_at: new Date().toISOString(),
      completion_reason: reason,
      phase: "complete",
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  return requireRow<StudySession>(data, error, "Unable to complete the session");
}

function getSessionStats(
  session: StudySession,
  words: SessionWordWithWord[],
): SessionStats {
  return {
    extraReviewCount: words.filter(
      (word) => word.miss_count > 0 || word.guessed_count > 0,
    ).length,
    learnedCount: words.length,
    questionsAnswered: session.total_questions_answered,
    readyCount: getReadyCount(words),
  };
}

function assertNoError(
  error: { message: string; code?: string } | null,
  fallbackMessage: string,
): asserts error is null {
  if (error) {
    throw new Error(`${fallbackMessage}: ${error.message}`);
  }
}

function requireRow<T>(
  data: unknown,
  error: { message: string; code?: string } | null,
  fallbackMessage: string,
) {
  assertNoError(error, fallbackMessage);

  if (!data) {
    throw new Error(fallbackMessage);
  }

  return data as T;
}
