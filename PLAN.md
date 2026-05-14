# Today Edge Session MVP Plan

## Summary

Build the MVP as an authenticated, single-purpose daily study loop on top of Supabase. Keep /dashboard as the authenticated home screen and add /session for the
learn/practice/completion flow. Remove the generic starter dashboard/sidebar experience because the design goal is “one thing to do today.”

Explicit choices:

- Default daily word count: 6, configurable with DAILY_WORD_COUNT and bounded for MVP to 5–7.
- Question cap: 45.
- Use the existing CSV as the seed source for Supabase.
- Keep auth required for MVP; no anonymous/demo mode.
- Use server-side Supabase access for study data; browser Supabase remains only for auth.

## Incremental Implementation

1. Template cleanup and routing
   - Fix env var consistency to use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY everywhere.
   - Update app metadata and auth redirects to VocabSAT routes.
   - Replace generic dashboard/sidebar UI with a focused app shell: product name, account/sign-out, and the daily session home card.
2. Supabase infrastructure
   - Add Supabase SQL migration and seed structure.
   - Create tables for vocab_words, study_sessions, study_session_words, study_question_attempts, and user_word_mastery.
   - Enable RLS on user-owned tables; allow authenticated reads of vocab_words; enforce user_id = (select auth.uid()) policies and add indexes for FK/RLS columns.
   - Seed vocab_words from sat_300_plus_vocab_dataset.csv with idempotent upserts.
3. Study domain layer
   - Add typed study config, statuses, and question types.
   - Implement today-session selection:
     - Continue unfinished current-day session first.
     - Otherwise choose weak prior words first.
     - Fill remaining slots with next unseen words ordered by dataset id.
   - Store one session per user per day with a configurable app timezone helper, defaulting to America/Los_Angeles.
4. Session engine
   - Add server actions that always authenticate internally:
     - start/continue today’s session
     - advance learn card
     - submit answer
     - complete/cap session
   - Generate mixed questions from today’s words only, using the target word id as the canonical answer for all question types.
   - Use example sentences by blanking the target word for SAT-style usage questions.
   - Track satisfied question types per word; mark recall_ready only after known correct answers across meaning recognition, reverse recall, and SAT usage.
   - After correct SAT-style usage, show guess check only until that word’s SAT usage type is credited.
5. MVP UI
   - Build these screens only: home card, learn card, question, correction, guess check, completion.
   - Use shadcn Card, Button, Badge, Skeleton, and add Progress if needed.
   - Keep the visual direction quiet and study-focused: compact cards, clear progress, restrained semantic tokens, no decorative dashboard clutter.
   - Keep all interactive session UI in client components under a server-loaded /session route.
6. Docs and handoff
   - Update README with Supabase setup steps, migration/seed instructions, required env vars, and manual acceptance checks.
   - Do not add diagnostics, word library, streaks, leaderboards, or alternate study modes.

## Public Interfaces And Data

- vocab_words: seeded word bank with word, fast_meaning, example_sentence.
- study_sessions: per-user daily session state, cap, phase, completion status.
- study_session_words: per-session word status, position, satisfied question types, counters.
- study_question_attempts: immutable answer history for stats and mastery updates.
- user_word_mastery: cross-session weak/unseen/ready state used for future selection.

Server mutations should accept simple ids and validate ownership in the action before writing. The client should never write study rows directly with the browser
Supabase client.

## Test Plan

Manual checks only, per repo guidance:

- Fresh user signs up/logs in and sees “Start Today’s Edge Session.”
- Starting creates one daily session with 5–7 seeded words.
- Learn cards advance into mixed practice.
- Wrong answers show compact correction and return later.
- Correct SAT usage triggers guess check; “Guessed” keeps the word shaky.
- A word becomes recall-ready only after all three question types are known correct.
- Session completes when all words are ready or caps at 45 questions.
- Refreshing /dashboard or /session continues the current day’s session.

## Assumptions

- The existing CSV is the authoritative MVP word dataset.
- Supabase project is fresh, so migrations can create the initial schema.
- Existing dirty files are user/template state and should not be reverted.
- Automated test/dev-server commands are left to the programmer.
