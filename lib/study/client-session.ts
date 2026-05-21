"use client";

import {
  FOREVER_REVIEW_STALE_DAYS,
  FOREVER_REVIEW_QUESTION_CAP,
  getDailyWordCount,
  MAX_DAILY_REVIEW_WORD_COUNT,
  QUESTION_CAP,
  QUESTION_CAP_PER_WORD,
  REVIEW_INTERVAL_DAYS,
} from "@/lib/study/config";
import { addDaysToStudyDate, getStudyDate } from "@/lib/study/dates";
import {
  buildNextForeverReviewQuestion,
  buildNextQuestion,
  gradeTypedAnswer,
  getReadyCount,
  isRecallReady,
} from "@/lib/study/questions";
import { getStudyProgress } from "@/lib/study/progress";
import type {
  AnswerConfidence,
  DailyWordStatus,
  DefinitionSelfGrade,
  ForeverReviewCheckpoint,
  ForeverReviewSummary,
  ForeverReviewView,
  LatestAttempt,
  PendingGuess,
  QuestionType,
  SessionWordSource,
  SessionStats,
  SessionView,
  SessionWordWithWord,
  StudyQuestion,
  StudySession,
  StudySessionType,
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
  next_review_on: string | null;
  review_interval_days: number;
};

type AttemptRow = {
  id: string;
  session_id: string;
  session_word_id: string;
  user_id: string;
  vocab_word_id: number;
  question_type: QuestionType;
  answer_mode: "multiple_choice" | "typed";
  selected_vocab_word_id: number | null;
  typed_answer: string | null;
  is_correct: boolean;
  confidence: AnswerConfidence | null;
  created_at: string;
};

type SubmitMultipleChoiceAnswerInput = {
  attemptId: string;
  sessionWordId: string;
  questionType: QuestionType;
  selectedVocabWordId: number;
};

type SubmitTypedAnswerInput = {
  attemptId: string;
  sessionWordId: string;
  questionType: QuestionType;
  typedAnswer: string;
  selfGrade?: DefinitionSelfGrade;
};

type SubmitAnswerInput =
  | SubmitMultipleChoiceAnswerInput
  | SubmitTypedAnswerInput;

type SelectedSessionWord = {
  word: VocabWord;
  source: SessionWordSource;
  masteryStatus: UserWordStatus | null;
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
    const selectedWords = await selectWordsForToday(
      supabase,
      userId,
      dailyWordCount,
      studyDate,
    );
    const { count, error } = await supabase
      .from("vocab_words")
      .select("id", { count: "exact", head: true });

    assertNoError(error, "Unable to count seeded vocabulary words");

    return {
      hasSession: false,
      availableWordCount: count ?? 0,
      dailyWordCount,
      dueReviewCount: selectedWords.filter((entry) => entry.source === "review")
        .length,
      newWordCount: selectedWords.filter((entry) => entry.source === "new")
        .length,
      studyDate,
      weakDueCount: selectedWords.filter(
        (entry) => entry.source === "review" && entry.masteryStatus === "weak",
      ).length,
    };
  }

  const words = await getSessionWords(supabase, userId, session.id);
  const reviewWords = words.filter((word) => word.source === "review");

  return {
    hasSession: true,
    completed: session.phase === "complete",
    completionReason: session.completion_reason,
    dailyWordCount: session.daily_word_count,
    masteryProgressPercent: getStudyProgress(words).percent,
    phase: session.phase,
    questionCap: session.question_cap,
    questionsAnswered: session.total_questions_answered,
    readyCount: getReadyCount(words),
    dueReviewCount: reviewWords.length,
    newWordCount: words.filter((word) => word.source === "new").length,
    reviewWordCount: reviewWords.length,
    studyDate,
    weakDueCount: reviewWords.filter(
      (word) =>
        word.status === "shaky" ||
        word.miss_count > 0 ||
        word.guessed_count > 0,
    ).length,
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
    return ensureSessionHasWords(supabase, userId, existingSession, studyDate);
  }

  const dailyWordCount = getDailyWordCount();
  const selectedWords = await selectWordsForToday(
    supabase,
    userId,
    dailyWordCount,
    studyDate,
  );

  if (selectedWords.length === 0) {
    throw new Error(
      "No new or due review words are available for today.",
    );
  }

  const { data: insertedSession, error: sessionError } = await supabase
    .from("study_sessions")
    .insert({
      daily_word_count: dailyWordCount,
      phase: "learn",
      question_cap: getQuestionCap(selectedWords.length),
      session_type: "daily",
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

  const sessionWords = selectedWords.map((entry, index) => ({
    ...getInitialSessionWordState(entry),
    position: index,
    session_id: session.id,
    user_id: userId,
    vocab_word_id: entry.word.id,
  }));

  const { error: wordsError } = await supabase
    .from("study_session_words")
    .insert(sessionWords);

  assertNoError(wordsError, "Unable to attach words to today's session");
  await markWordsSeen(supabase, userId, selectedWords);

  return session;
}

async function ensureSessionHasWords(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
  studyDate: string,
) {
  const existingWords = await getSessionWords(supabase, userId, session.id);

  if (existingWords.length > 0) {
    return session;
  }

  const dailyWordCount = getDailyWordCount();
  const selectedWords = await selectWordsForToday(
    supabase,
    userId,
    dailyWordCount,
    studyDate,
  );

  if (selectedWords.length === 0) {
    throw new Error("No new or due review words are available for today.");
  }

  const sessionWords = selectedWords.map((entry, index) => ({
    ...getInitialSessionWordState(entry),
    position: index,
    session_id: session.id,
    user_id: userId,
    vocab_word_id: entry.word.id,
  }));

  const { error: wordsError } = await supabase
    .from("study_session_words")
    .insert(sessionWords);

  assertNoError(wordsError, "Unable to attach words to today's session");
  await markWordsSeen(supabase, userId, selectedWords);

  const { data, error } = await supabase
    .from("study_sessions")
    .update({
      completed_at: null,
      completion_reason: null,
      daily_word_count: dailyWordCount,
      learn_index: 0,
      phase: "learn",
      question_cap: getQuestionCap(selectedWords.length),
      total_questions_answered: 0,
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  return requireRow<StudySession>(data, error, "Unable to repair today's session");
}

export async function getSessionView(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionView> {
  let session = await startOrContinueTodaySession(supabase, userId);
  let words = await getSessionWords(supabase, userId, session.id);
  const learnWords = getLearnWords(words);

  if (session.phase === "learn" && session.learn_index >= learnWords.length) {
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

export async function getForeverReviewSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<ForeverReviewSummary> {
  const studyDate = getStudyDate();
  const { data, error } = await supabase
    .from("user_word_mastery")
    .select(
      "user_id, vocab_word_id, status, correct_count, miss_count, guessed_count, last_seen_at, last_ready_at, next_review_on, review_interval_days",
    )
    .eq("user_id", userId);

  assertNoError(error, "Unable to load review words");

  const masteryRows = (data ?? []) as MasteryRow[];

  return {
    dueCount: masteryRows.filter((row) => isDueForReview(row, studyDate)).length,
    eligibleWordCount: masteryRows.length,
    staleCount: masteryRows.filter((row) => isStaleForReview(row, studyDate))
      .length,
    studyDate,
    weakCount: masteryRows.filter((row) => row.status === "weak").length,
  };
}

export async function startForeverReviewSession(
  supabase: SupabaseClient,
  userId: string,
) {
  const studyDate = getStudyDate();
  const existingSession = await getSessionForDate(
    supabase,
    userId,
    studyDate,
    "forever_review",
  );

  if (existingSession) {
    const repairedSession =
      existingSession.phase === "complete"
        ? await reopenForeverReviewSession(supabase, userId, existingSession)
        : existingSession;

    await ensureForeverReviewHasWords(
      supabase,
      userId,
      repairedSession,
      studyDate,
    );

    return repairedSession;
  }

  const selectedWords = await selectWordsForForeverReview(
    supabase,
    userId,
    studyDate,
  );

  if (selectedWords.length === 0) {
    throw new Error("No previously learned words are available for review yet.");
  }

  const { data: insertedSession, error: sessionError } = await supabase
    .from("study_sessions")
    .insert({
      daily_word_count: getDailyWordCount(),
      phase: "practice",
      question_cap: FOREVER_REVIEW_QUESTION_CAP,
      session_type: "forever_review",
      study_date: studyDate,
      user_id: userId,
    })
    .select("*")
    .single();

  if (sessionError?.code === "23505") {
    const racedSession = await getSessionForDate(
      supabase,
      userId,
      studyDate,
      "forever_review",
    );

    if (racedSession) {
      await ensureForeverReviewHasWords(
        supabase,
        userId,
        racedSession,
        studyDate,
      );

      return racedSession;
    }
  }

  const session = requireRow<StudySession>(
    insertedSession,
    sessionError,
    "Unable to create the review session",
  );

  await insertForeverReviewWords(supabase, userId, session.id, selectedWords);

  return session;
}

export async function getForeverReviewView(
  supabase: SupabaseClient,
  userId: string,
): Promise<ForeverReviewView> {
  const session = await startForeverReviewSession(supabase, userId);
  const words = await getSessionWords(supabase, userId, session.id);
  const latestAttempt = await getLatestAttempt(supabase, session.id);
  const optionWords = await getQuestionOptionWords(supabase);
  const question = buildNextForeverReviewQuestion(
    session,
    words,
    latestAttempt,
    optionWords,
  );

  if (!question) {
    throw new Error("No previously learned words are available for review yet.");
  }

  return {
    checkpoint: await getForeverReviewCheckpoint(supabase, userId, session, words),
    mode: "forever_review",
    optionWords,
    question,
    readyCount: getReadyCount(words),
    screen: "question",
    session,
    totalWords: words.length,
    words,
  };
}

export async function advanceLearn(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
  words: SessionWordWithWord[],
) {
  const learnWords = getLearnWords(words);
  const nextIndex = Math.min(session.learn_index + 1, learnWords.length);
  const nextPhase = nextIndex >= learnWords.length ? "practice" : "learn";

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

export async function replaceKnownLearnWord(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  sessionWordId: string,
): Promise<SessionView> {
  const session = await getSessionById(supabase, userId, sessionId);

  if (session.session_type !== "daily" || session.phase !== "learn") {
    throw new Error("Daily words can only be replaced during learning.");
  }

  const words = await getSessionWords(supabase, userId, session.id);
  const learnWords = getLearnWords(words);
  const activeWord = learnWords[session.learn_index];

  if (!activeWord || activeWord.id !== sessionWordId) {
    throw new Error("This word is no longer the active learn card.");
  }

  const replacementWord = await getNextReplacementWord(
    supabase,
    userId,
    words,
  );

  if (!replacementWord) {
    throw new Error("No replacement words are available.");
  }

  const { error } = await supabase
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
      satisfied_definition_recall: false,
      satisfied_word_recall: false,
      source: "new",
      status: "new",
      vocab_word_id: replacementWord.id,
    })
    .eq("id", activeWord.id)
    .eq("session_id", session.id)
    .eq("user_id", userId);

  assertNoError(error, "Unable to replace the word");

  await markWordAlreadyKnown(supabase, userId, activeWord.vocab_word_id);
  await markWordsSeen(supabase, userId, [
    {
      masteryStatus: null,
      source: "new",
      word: replacementWord,
    },
  ]);

  return getSessionView(supabase, userId);
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
  const optionWords = await getQuestionOptionWords(supabase);
  const currentQuestion = buildNextQuestion(
    session,
    words,
    latestAttempt,
    optionWords,
  );

  if (!doesSubmittedAnswerMatchQuestion(currentQuestion, input)) {
    throw new Error("This answer no longer matches the active question.");
  }

  const answer = getSubmittedAnswer(input, sessionWord);
  const shouldAskGuess =
    answer.isCorrect &&
    answer.answerMode === "multiple_choice" &&
    input.questionType === "sat_usage" &&
    !sessionWord.satisfied_sat_usage;

  const { data: insertedAttempt, error: attemptError } = await supabase
    .from("study_question_attempts")
    .insert({
      answer_mode: answer.answerMode,
      id: input.attemptId,
      confidence: answer.isCorrect && !shouldAskGuess ? "known" : null,
      is_correct: answer.isCorrect,
      question_type: input.questionType,
      selected_vocab_word_id: answer.selectedVocabWordId,
      session_id: session.id,
      session_word_id: sessionWord.id,
      typed_answer: answer.typedAnswer,
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

  if (!answer.isCorrect) {
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

export async function submitForeverReviewAnswer(
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

  if (session.session_type !== "forever_review") {
    throw new Error("This answer does not belong to a review session.");
  }

  if (session.phase !== "practice") {
    throw new Error("This review session is not ready for practice yet.");
  }

  const words = await getSessionWords(supabase, userId, session.id);
  const latestAttempt = await getLatestAttempt(supabase, session.id);
  const optionWords = await getQuestionOptionWords(supabase);
  const currentQuestion = buildNextForeverReviewQuestion(
    session,
    words,
    latestAttempt,
    optionWords,
  );

  if (!doesSubmittedAnswerMatchQuestion(currentQuestion, input)) {
    throw new Error("This answer no longer matches the active review question.");
  }

  const answer = getSubmittedAnswer(input, sessionWord);
  const shouldAskGuess =
    answer.isCorrect &&
    answer.answerMode === "multiple_choice" &&
    input.questionType === "sat_usage";

  const { data: insertedAttempt, error: attemptError } = await supabase
    .from("study_question_attempts")
    .insert({
      answer_mode: answer.answerMode,
      id: input.attemptId,
      confidence: answer.isCorrect && !shouldAskGuess ? "known" : null,
      is_correct: answer.isCorrect,
      question_type: input.questionType,
      selected_vocab_word_id: answer.selectedVocabWordId,
      session_id: session.id,
      session_word_id: sessionWord.id,
      typed_answer: answer.typedAnswer,
      user_id: userId,
      vocab_word_id: sessionWord.vocab_word_id,
    })
    .select("*")
    .single();

  const attempt = requireRow<AttemptRow>(
    insertedAttempt,
    attemptError,
    "Unable to record the review answer",
  );

  await incrementSessionQuestionCount(supabase, userId, session);

  if (!answer.isCorrect) {
    await markWordMissed(supabase, userId, sessionWord, input.questionType);

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

  return { outcome: "continue" };
}

function doesSubmittedAnswerMatchQuestion(
  currentQuestion: StudyQuestion | null,
  input: SubmitAnswerInput,
) {
  if (
    !currentQuestion ||
    currentQuestion.targetSessionWordId !== input.sessionWordId ||
    currentQuestion.questionType !== input.questionType
  ) {
    return false;
  }

  if (isMultipleChoiceAnswer(input)) {
    return (
      currentQuestion.answerMode === "multiple_choice" &&
      currentQuestion.options.some(
        (option) => option.vocabWordId === input.selectedVocabWordId,
      )
    );
  }

  return currentQuestion.answerMode === "typed";
}

function getSubmittedAnswer(
  input: SubmitAnswerInput,
  sessionWord: SessionWordWithWord,
) {
  if (isMultipleChoiceAnswer(input)) {
    return {
      answerMode: "multiple_choice" as const,
      isCorrect: input.selectedVocabWordId === sessionWord.vocab_word_id,
      selectedVocabWordId: input.selectedVocabWordId,
      typedAnswer: null,
    };
  }

  return {
    answerMode: "typed" as const,
    isCorrect:
      input.selfGrade === "correct" ||
      (!input.selfGrade &&
        gradeTypedAnswer(
          input.questionType,
          sessionWord.vocab_word,
          input.typedAnswer,
        ) === "correct"),
    selectedVocabWordId: null,
    typedAnswer: input.typedAnswer,
  };
}

function isMultipleChoiceAnswer(
  input: SubmitAnswerInput,
): input is SubmitMultipleChoiceAnswerInput {
  return "selectedVocabWordId" in input;
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

export async function recordForeverReviewGuess(
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

  const session = await getSessionById(supabase, userId, attempt.session_id);

  if (session.session_type !== "forever_review") {
    throw new Error("This guess check does not belong to a review session.");
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

  assertNoError(attemptError, "Unable to save the review guess check");

  if (confidence === "guessed") {
    await markWordGuessed(supabase, userId, sessionWord, "sat_usage");
  } else {
    await creditKnownAnswer(supabase, userId, sessionWord, "sat_usage");
  }
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
      satisfied_definition_recall: false,
      satisfied_word_recall: false,
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
    const learnWords = getLearnWords(words);
    const currentWord = learnWords[session.learn_index];

    if (currentWord) {
      return {
        screen: "learn",
        currentIndex: session.learn_index,
        currentWord,
        learnWords,
        session,
        totalWords: learnWords.length,
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
  const optionWords = await getQuestionOptionWords(supabase);
  const question = buildNextQuestion(session, words, latestAttempt, optionWords);

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
    optionWords,
    readyCount: getReadyCount(words),
    session,
    totalWords: words.length,
    words,
  };
}

async function ensureForeverReviewHasWords(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
  studyDate: string,
) {
  const existingWords = await getSessionWords(supabase, userId, session.id);

  if (existingWords.length > 0) {
    return;
  }

  const selectedWords = await selectWordsForForeverReview(
    supabase,
    userId,
    studyDate,
  );

  if (selectedWords.length === 0) {
    throw new Error("No previously learned words are available for review yet.");
  }

  await insertForeverReviewWords(supabase, userId, session.id, selectedWords);
}

async function insertForeverReviewWords(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  selectedWords: SelectedSessionWord[],
) {
  const sessionWords = selectedWords.map((entry, index) => ({
    ...getInitialForeverReviewWordState(entry),
    position: index,
    session_id: sessionId,
    user_id: userId,
    vocab_word_id: entry.word.id,
  }));

  const { error } = await supabase
    .from("study_session_words")
    .insert(sessionWords);

  assertNoError(error, "Unable to attach review words");
}

async function reopenForeverReviewSession(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
) {
  const { data, error } = await supabase
    .from("study_sessions")
    .update({
      completed_at: null,
      completion_reason: null,
      phase: "practice",
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  return requireRow<StudySession>(
    data,
    error,
    "Unable to reopen the review session",
  );
}

async function getForeverReviewCheckpoint(
  supabase: SupabaseClient,
  userId: string,
  session: StudySession,
  words: SessionWordWithWord[],
): Promise<ForeverReviewCheckpoint> {
  const { data, error } = await supabase
    .from("study_question_attempts")
    .select("session_word_id, is_correct, confidence")
    .eq("session_id", session.id)
    .eq("user_id", userId);

  assertNoError(error, "Unable to load review checkpoint stats");

  const attempts = (data ?? []) as Array<{
    session_word_id: string;
    is_correct: boolean;
    confidence: AnswerConfidence | null;
  }>;
  const weakWordIds = new Set<string>();

  attempts.forEach((attempt) => {
    if (!attempt.is_correct || attempt.confidence === "guessed") {
      weakWordIds.add(attempt.session_word_id);
    }
  });

  return {
    correctCount: attempts.filter((attempt) => attempt.is_correct).length,
    questionsAnswered: session.total_questions_answered,
    strengthenedCount: words.filter(
      (word) =>
        word.correct_count > 0 &&
        word.status === "recall_ready" &&
        word.miss_count === 0 &&
        word.guessed_count === 0,
    ).length,
    weakWordsFound: weakWordIds.size,
  };
}

function getLearnWords(words: SessionWordWithWord[]) {
  return words.filter((word) => word.source === "new");
}

async function getSessionForDate(
  supabase: SupabaseClient,
  userId: string,
  studyDate: string,
  sessionType: StudySessionType = "daily",
) {
  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("study_date", studyDate)
    .eq("session_type", sessionType)
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

async function getQuestionOptionWords(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("vocab_words")
    .select("id, word, fast_meaning, example_sentence, sort_order")
    .order("sort_order", { ascending: true });

  assertNoError(error, "Unable to load question options");

  return (data ?? []) as VocabWord[];
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
  studyDate: string,
): Promise<SelectedSessionWord[]> {
  const [
    { data: masteryData, error: masteryError },
    { data: wordData, error: wordError },
  ] = await Promise.all([
    supabase
      .from("user_word_mastery")
      .select(
        "user_id, vocab_word_id, status, correct_count, miss_count, guessed_count, last_seen_at, last_ready_at, next_review_on, review_interval_days",
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
  const wordOrderRankById = new Map<number, number>(
    words.map((word): [number, number] => [
      word.id,
      getUserWordOrderRank(userId, word),
    ]),
  );
  const wordsByUserOrder = [...words].sort((first, second) =>
    compareWordsByUserOrder(first, second, wordOrderRankById),
  );
  const seenWordIds = new Set(masteryRows.map((row) => row.vocab_word_id));
  const selected = new Map<number, SelectedSessionWord>();

  masteryRows
    .filter((row) => isDueForReview(row, studyDate))
    .sort((first, second) => {
      const statusComparison =
        getDueReviewStatusPriority(second) - getDueReviewStatusPriority(first);

      if (statusComparison !== 0) {
        return statusComparison;
      }

      const firstScore = getMasteryPriority(first);
      const secondScore = getMasteryPriority(second);

      if (firstScore !== secondScore) {
        return secondScore - firstScore;
      }

      const lastSeenComparison = (first.last_seen_at ?? "").localeCompare(
        second.last_seen_at ?? "",
      );

      if (lastSeenComparison !== 0) {
        return lastSeenComparison;
      }

      return compareMasteryRowsByUserOrder(
        first,
        second,
        wordOrderRankById,
      );
    })
    .forEach((row) => {
      const word = wordsById.get(row.vocab_word_id);

      if (word && selected.size < MAX_DAILY_REVIEW_WORD_COUNT) {
        selected.set(word.id, {
          masteryStatus: row.status,
          source: "review",
          word,
        });
      }
    });

  for (const word of wordsByUserOrder) {
    const newWordCount = getSelectedSourceCount(selected, "new");

    if (newWordCount >= limit) {
      break;
    }

    if (!seenWordIds.has(word.id)) {
      selected.set(word.id, {
        masteryStatus: null,
        source: "new",
        word,
      });
    }
  }

  return Array.from(selected.values());
}

async function getNextReplacementWord(
  supabase: SupabaseClient,
  userId: string,
  sessionWords: SessionWordWithWord[],
): Promise<VocabWord | null> {
  const [
    { data: masteryData, error: masteryError },
    { data: wordData, error: wordError },
  ] = await Promise.all([
    supabase
      .from("user_word_mastery")
      .select("vocab_word_id")
      .eq("user_id", userId),
    supabase
      .from("vocab_words")
      .select("id, word, fast_meaning, example_sentence, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  assertNoError(masteryError, "Unable to load prior word mastery");
  assertNoError(wordError, "Unable to load vocabulary words");

  const words = (wordData ?? []) as VocabWord[];
  const sessionWordIds = new Set(
    sessionWords.map((word) => word.vocab_word_id),
  );
  const seenWordIds = new Set(
    ((masteryData ?? []) as Array<{ vocab_word_id: number }>).map(
      (row) => row.vocab_word_id,
    ),
  );
  const wordOrderRankById = new Map<number, number>(
    words.map((word): [number, number] => [
      word.id,
      getUserWordOrderRank(userId, word),
    ]),
  );

  return (
    [...words]
      .sort((first, second) =>
        compareWordsByUserOrder(first, second, wordOrderRankById),
      )
      .find(
        (word) => !sessionWordIds.has(word.id) && !seenWordIds.has(word.id),
      ) ?? null
  );
}

async function selectWordsForForeverReview(
  supabase: SupabaseClient,
  userId: string,
  studyDate: string,
): Promise<SelectedSessionWord[]> {
  const [
    { data: masteryData, error: masteryError },
    { data: wordData, error: wordError },
  ] = await Promise.all([
    supabase
      .from("user_word_mastery")
      .select(
        "user_id, vocab_word_id, status, correct_count, miss_count, guessed_count, last_seen_at, last_ready_at, next_review_on, review_interval_days",
      )
      .eq("user_id", userId),
    supabase
      .from("vocab_words")
      .select("id, word, fast_meaning, example_sentence, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  assertNoError(masteryError, "Unable to load review mastery");
  assertNoError(wordError, "Unable to load vocabulary words");

  const masteryRows = (masteryData ?? []) as MasteryRow[];
  const words = (wordData ?? []) as VocabWord[];
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const wordOrderRankById = new Map<number, number>(
    words.map((word): [number, number] => [
      word.id,
      getUserWordOrderRank(userId, word),
    ]),
  );

  return masteryRows
    .filter((row) => wordsById.has(row.vocab_word_id))
    .sort((first, second) => {
      const firstScore = getForeverReviewMasteryPriority(first, studyDate);
      const secondScore = getForeverReviewMasteryPriority(second, studyDate);

      if (firstScore !== secondScore) {
        return secondScore - firstScore;
      }

      const lastSeenComparison = (first.last_seen_at ?? "").localeCompare(
        second.last_seen_at ?? "",
      );

      if (lastSeenComparison !== 0) {
        return lastSeenComparison;
      }

      return compareMasteryRowsByUserOrder(first, second, wordOrderRankById);
    })
    .map((row) => ({
      masteryStatus: row.status,
      source: "review",
      word: wordsById.get(row.vocab_word_id) as VocabWord,
    }));
}

function getQuestionCap(wordCount: number) {
  return Math.max(QUESTION_CAP, wordCount * QUESTION_CAP_PER_WORD);
}

function getInitialSessionWordState(entry: SelectedSessionWord) {
  const baseState = {
    satisfied_meaning_recognition: false,
    satisfied_reverse_recall: false,
    satisfied_sat_usage: false,
    satisfied_definition_recall: false,
    satisfied_word_recall: false,
    source: entry.source,
    status: "new" as const,
  };

  if (entry.source === "new") {
    return baseState;
  }

  if (entry.masteryStatus === "recall_ready") {
    return {
      ...baseState,
      satisfied_meaning_recognition: true,
      satisfied_reverse_recall: true,
      status: "stable" as const,
    };
  }

  return {
    ...baseState,
    status: "shaky" as const,
  };
}

function getInitialForeverReviewWordState(entry: SelectedSessionWord) {
  const isReady = entry.masteryStatus === "recall_ready";

  return {
    satisfied_meaning_recognition: isReady,
    satisfied_reverse_recall: isReady,
    satisfied_sat_usage: isReady,
    satisfied_definition_recall: isReady,
    satisfied_word_recall: isReady,
    source: "review" as const,
    status: isReady ? ("recall_ready" as const) : ("shaky" as const),
  };
}

function getSelectedSourceCount(
  selected: Map<number, SelectedSessionWord>,
  source: SessionWordSource,
) {
  return Array.from(selected.values()).filter((entry) => entry.source === source)
    .length;
}

function isDueForReview(row: MasteryRow, studyDate: string) {
  return Boolean(row.next_review_on && row.next_review_on <= studyDate);
}

function getDueReviewStatusPriority(row: MasteryRow) {
  if (row.status === "weak") {
    return 3;
  }

  if (row.status === "learning") {
    return 2;
  }

  return 1;
}

function getMasteryPriority(row: MasteryRow) {
  const statusScore = row.status === "weak" ? 100 : 50;
  return (
    statusScore + row.miss_count * 8 + row.guessed_count * 6 - row.correct_count
  );
}

function getForeverReviewMasteryPriority(row: MasteryRow, studyDate: string) {
  const statusScore =
    row.status === "weak" ? 1000 : row.status === "learning" ? 520 : 80;
  const guessedScore = row.guessed_count > 0 ? 780 : 0;
  const dueScore = isDueForReview(row, studyDate) ? 620 : 0;
  const staleScore = isStaleForReview(row, studyDate) ? 420 : 0;
  const performanceScore =
    row.miss_count * 18 + row.guessed_count * 12 - row.correct_count * 2;

  return statusScore + guessedScore + dueScore + staleScore + performanceScore;
}

function isStaleForReview(row: MasteryRow, studyDate: string) {
  if (!row.last_seen_at) {
    return true;
  }

  return getStudyDateDistance(row.last_seen_at.slice(0, 10), studyDate) >=
    FOREVER_REVIEW_STALE_DAYS;
}

function getStudyDateDistance(firstDate: string, secondDate: string) {
  const firstTime = Date.parse(`${firstDate}T00:00:00.000Z`);
  const secondTime = Date.parse(`${secondDate}T00:00:00.000Z`);

  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) {
    return 0;
  }

  return Math.floor((secondTime - firstTime) / 86_400_000);
}

function getUserWordOrderRank(userId: string, word: VocabWord) {
  return hashString(`${userId}:${word.id}`);
}

function compareWordsByUserOrder(
  first: VocabWord,
  second: VocabWord,
  wordOrderRankById: Map<number, number>,
) {
  const rankComparison =
    getWordOrderRank(wordOrderRankById, first.id) -
    getWordOrderRank(wordOrderRankById, second.id);

  if (rankComparison !== 0) {
    return rankComparison;
  }

  if (first.sort_order !== second.sort_order) {
    return first.sort_order - second.sort_order;
  }

  return first.id - second.id;
}

function compareMasteryRowsByUserOrder(
  first: MasteryRow,
  second: MasteryRow,
  wordOrderRankById: Map<number, number>,
) {
  const rankComparison =
    getWordOrderRank(wordOrderRankById, first.vocab_word_id) -
    getWordOrderRank(wordOrderRankById, second.vocab_word_id);

  if (rankComparison !== 0) {
    return rankComparison;
  }

  return first.vocab_word_id - second.vocab_word_id;
}

function getWordOrderRank(
  wordOrderRankById: Map<number, number>,
  vocabWordId: number,
) {
  return wordOrderRankById.get(vocabWordId) ?? Number.MAX_SAFE_INTEGER;
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash;
}

async function markWordsSeen(
  supabase: SupabaseClient,
  userId: string,
  selectedWords: SelectedSessionWord[],
) {
  const now = new Date().toISOString();
  const tomorrow = addDaysToStudyDate(getStudyDate(), REVIEW_INTERVAL_DAYS[0]);
  const wordIds = selectedWords.map((entry) => entry.word.id);
  const { data, error } = await supabase
    .from("user_word_mastery")
    .select(
      "user_id, vocab_word_id, status, correct_count, miss_count, guessed_count, last_seen_at, last_ready_at, next_review_on, review_interval_days",
    )
    .eq("user_id", userId)
    .in("vocab_word_id", wordIds);

  assertNoError(error, "Unable to load selected word mastery");

  const existingRows = new Map(
    ((data ?? []) as MasteryRow[]).map((row) => [row.vocab_word_id, row]),
  );

  const rows = selectedWords.map((entry) => {
    const existing = existingRows.get(entry.word.id);

    return {
      last_seen_at: now,
      next_review_on: existing?.next_review_on ?? tomorrow,
      review_interval_days: existing?.review_interval_days ?? 0,
      status:
        entry.source === "new"
          ? "learning"
          : existing?.status === "weak"
            ? "weak"
            : existing?.status ?? "learning",
      user_id: userId,
      vocab_word_id: entry.word.id,
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
  await touchMasterySeen(supabase, userId, word.vocab_word_id);
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

  if (questionType === "sat_usage") {
    return { satisfied_sat_usage: true };
  }

  if (questionType === "word_recall") {
    return { satisfied_word_recall: true };
  }

  return { satisfied_definition_recall: true };
}

function getNextKnownStatus(word: SessionWordWithWord): DailyWordStatus {
  if (isRecallReady(word)) {
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
      "user_id, vocab_word_id, status, correct_count, miss_count, guessed_count, last_seen_at, last_ready_at, next_review_on, review_interval_days",
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
  const nextIntervalDays = getNextReviewIntervalDays(existing, result);
  const daysUntilReview =
    result.isCorrect && !result.guessed && !result.isRecallReady
      ? REVIEW_INTERVAL_DAYS[0]
      : nextIntervalDays;
  const nextReviewOn = addDaysToStudyDate(getStudyDate(), daysUntilReview);

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
        next_review_on: nextReviewOn,
        review_interval_days: nextIntervalDays,
        status: nextStatus,
        user_id: userId,
        vocab_word_id: vocabWordId,
      },
      { onConflict: "user_id,vocab_word_id" },
    );

  assertNoError(upsertError, "Unable to update word mastery");
}

async function markWordAlreadyKnown(
  supabase: SupabaseClient,
  userId: string,
  vocabWordId: number,
) {
  await updateMasteryAfterAttempt(supabase, userId, vocabWordId, {
    guessed: false,
    isCorrect: true,
    isRecallReady: true,
  });
}

async function touchMasterySeen(
  supabase: SupabaseClient,
  userId: string,
  vocabWordId: number,
) {
  const { error } = await supabase
    .from("user_word_mastery")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("vocab_word_id", vocabWordId);

  assertNoError(error, "Unable to update word last seen time");
}

function getNextReviewIntervalDays(
  existing: MasteryRow | null,
  result: {
    isCorrect: boolean;
    guessed: boolean;
    isRecallReady: boolean;
  },
) {
  if (!result.isCorrect || result.guessed) {
    return REVIEW_INTERVAL_DAYS[0];
  }

  if (!result.isRecallReady) {
    return existing?.review_interval_days ?? 0;
  }

  const currentInterval = existing?.review_interval_days ?? 0;
  return (
    REVIEW_INTERVAL_DAYS.find((interval) => interval > currentInterval) ??
    REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1]
  );
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
    await scheduleCarryOverWords(supabase, userId, words);
    return completeSession(supabase, userId, session, "question_cap");
  }

  return session;
}

async function scheduleCarryOverWords(
  supabase: SupabaseClient,
  userId: string,
  words: SessionWordWithWord[],
) {
  const carryOverWordIds = words
    .filter((word) => word.status !== "recall_ready")
    .map((word) => word.vocab_word_id);

  if (carryOverWordIds.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_word_mastery")
    .update({
      last_seen_at: now,
      next_review_on: addDaysToStudyDate(getStudyDate(), REVIEW_INTERVAL_DAYS[0]),
      review_interval_days: REVIEW_INTERVAL_DAYS[0],
      status: "weak",
    })
    .eq("user_id", userId)
    .in("vocab_word_id", carryOverWordIds);

  assertNoError(error, "Unable to schedule carry-over words");
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
