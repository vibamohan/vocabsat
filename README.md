# VocabSAT

VocabSAT is a focused SAT vocabulary trainer built around daily recall, fast feedback, and spaced review. It gives each authenticated user a small daily set of hard SAT-style words, tests them with mixed question types, and keeps missed or guessed words in rotation until they are recall-ready.

## What It Does

- Runs a daily study session with 5-7 new words per user.
- Mixes recognition, reverse recall, typed recall, definition recall, and SAT-style usage questions.
- Shows corrections immediately after wrong answers.
- Asks users to mark whether correct SAT-style answers were known or guessed.
- Tracks word mastery across sessions with 90%-retention FSRS review scheduling.
- Tracks active response time and offers optional timed practice.
- Supports pronunciation, curated word origins, confusables, visual mnemonics, and private notes.
- Includes passage completion, sentence writing, and private learning analytics.
- Persists progress with Supabase Auth, Postgres, RLS, and typed client-side session logic.

## Why It Matters

This project is designed as a practical learning product, not a flashcard demo. The app manages authenticated user progress, deterministic word selection, adaptive question scheduling, answer history, reset behavior, and review checkpoints while keeping the interface simple enough for repeated daily use.

## Tech Stack

- Next.js App Router
- TypeScript
- Supabase Auth and Postgres with RLS
- shadcn/ui
- Tailwind CSS
- Vitest and Testing Library
- ts-fsrs

## Key Routes

- `/dashboard`: daily session status, forever review, and saved words
- `/session`: daily learn, practice, correction, guess check, and completion flow
- `/review`: ongoing review for previously seen words
- `/words`: vocabulary progress view
- `/passages`: curated passage-completion practice
- `/write`: sentence-writing practice with example comparison
- `/progress`: private accuracy, retention, and response-speed analytics

## Local Setup

Use Node.js 22.12 or newer. If you use `nvm`, the repository's `.nvmrc` selects a compatible version.

For guided setup and startup, run:

```bash
npm run local
```

On first run, the script asks for your Supabase project URL and publishable key, creates `.env.local`, and installs dependencies if needed.

Alternatively, set up the repository manually:

```bash
nvm use
npm ci
cp .env.example .env.local
```

Then update `.env.local` with your Supabase public project values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

Optional tuning:

```bash
NEXT_PUBLIC_DAILY_WORD_COUNT=6
NEXT_PUBLIC_STUDY_TIME_ZONE=America/Los_Angeles
```

Apply the Supabase SQL files in order:

1. Run every file in `supabase/migrations/` by filename.
2. Run `supabase/seed.sql`.
3. Add your local app URL to Supabase Auth settings.

The learning-expansion migration also creates a public-read `vocab-images` Storage bucket. Upload only reviewed, licensed images and store their object paths on `vocab_words`.

## Development

```bash
npm run check
```

The check command runs linting, TypeScript validation, and the unit test suite. The app requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` before running locally.
