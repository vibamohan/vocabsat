# VocabSAT

A focused Next.js + Supabase MVP for daily SAT vocabulary recall.

The app does one thing: an authenticated user starts today's session, learns a
small set of hard SAT-plausible words, answers mixed recall questions, reviews
misses immediately, and finishes when every word is recall-ready or the question
cap is reached.

## Stack

- Next.js App Router + TypeScript
- Supabase Auth + Postgres with RLS
- shadcn/ui components
- Tailwind CSS

## Environment

Create `.env.local` with the public Supabase values from Project Settings > API:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

Optional client-side tuning:

```bash
NEXT_PUBLIC_DAILY_WORD_COUNT=6
NEXT_PUBLIC_STUDY_TIME_ZONE=America/Los_Angeles
```

`NEXT_PUBLIC_DAILY_WORD_COUNT` is bounded to 5-7 for the MVP.

## Supabase Setup

This repo includes the initial database infrastructure:

- `supabase/migrations/202605140001_today_session_mvp.sql`
- `supabase/migrations/202605140002_allow_session_attempt_reset.sql`
- `supabase/seed.sql`
- `scripts/build-vocab-seed.mjs`
- `sat_300_plus_vocab_dataset.csv`

For a fresh hosted Supabase project, the most direct setup path is:

1. Open the Supabase SQL Editor.
2. Run every migration SQL file in `supabase/migrations/` in filename order.
3. Run the seed SQL in `supabase/seed.sql`.
4. In Auth settings, make sure your local URL is allowed while developing.

If the CSV changes, regenerate the seed SQL:

```bash
npm run seed:build
```

## Data Model

- `vocab_words`: seeded SAT word bank. `example_sentence` may contain multiple
  examples separated by `|`; the app parses them before display.
- `study_sessions`: user-owned session state per study date and session type
  (`daily` or `forever_review`).
- `study_session_words`: per-session word status and satisfied question types.
- `study_question_attempts`: immutable answer history.
- `user_word_mastery`: cross-session weak/learning/ready state for future selection.

RLS is enabled on study tables. Authenticated users can read seeded vocabulary
and can only read/write their own study rows.

## App Flow

- `/` redirects authenticated users to `/dashboard`, otherwise to `/auth/login`.
- `/dashboard` shows Today first, with a secondary Forever Review card below it.
- `/session` runs Learn, Practice, Correction, Guess Check, and Completion
  screens.
- `/review` runs optional endless review for words the user has already seen,
  with correction, guess check, and 10-question checkpoints.

Auth and study mutations run through the browser Supabase client. RLS and table
constraints are the guardrails; the MVP does not try to prevent users from
modifying their own study progress.

## Manual Acceptance Checks

- Fresh user signs up or logs in and sees the Today Session card.
- Start creates one daily session with 5-7 seeded words from the user's deterministic word order.
- Learn cards advance into mixed practice.
- Wrong answers show a compact correction and return later.
- Correct SAT-style usage asks "Knew it" vs "Guessed".
- "Guessed" keeps the word shaky.
- A word becomes recall-ready only after known correct answers for all three
  question types.
- Session completes when all words are recall-ready or the 45-question cap is
  reached.
- Refreshing `/dashboard` or `/session` continues the current day's session.
- Forever Review uses only previously seen words and shows a checkpoint every 10
  questions.
