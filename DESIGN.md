# MVP Design Doc: Today Edge Session

## Product Goal

Build one focused feature:

> A daily mastery loop that teaches 5–7 hard SAT-plausible vocabulary words and keeps quizzing the user until they can recall them reliably.

This MVP targets the **750+ niche-word problem**: users already understand SAT English well, but lose points when answer choices contain difficult words they do not know.

No onboarding.
No diagnostics.
No multiple study modes.
No full SAT practice.
No complex dashboard.

---

# Assumptions

A word dataset already exists.

Each word has at least:

- word
- fast meaning
- example sentence

Example:

```text
word: perfunctory
fast meaning: careless, routine, done with little effort
example: The committee gave the proposal only a perfunctory review.
```

---

# Main User Flow

The user opens the app and sees one main action:

> **Start Today’s Edge Session**

The app selects today’s words and guides the user through a loop:

1. Learn today’s words.
2. Answer mixed recall questions.
3. Get brief corrections after misses.
4. Repeat weak words.
5. Finish when every word is recall-ready, or when the question cap is reached.

The user should never choose a drill type.

---

# Home Screen

Show one card.

## Today’s Edge Session

Example copy:

```text
Today’s words are ready.

6 new words
Practice until they’re recall-ready.
```

Primary button:

```text
Start
```

For returning users with unfinished words:

```text
Continue today’s session

4 of 6 words recall-ready
```

---

# Daily Word Selection

Each session should use **5–7 words**.

For a first-time user:

- choose the next unseen words from the provided dataset.

For a returning user:

- prioritize unfinished words from the current day;
- then weak words from recent sessions;
- then add new words if there is room.

Keep this logic simple for MVP, but do not hard-code the product around exactly 6 words. The daily word count should be easy to adjust later.

---

# Session Structure

The session has three phases:

1. **Learn**
2. **Practice Loop**
3. **Complete**

---

# Phase 1: Learn

Show one word card at a time.

## Word Card Layout

```text
Perfunctory

Fast meaning:
Careless, routine, done with little effort.

Example:
The committee gave the proposal only a perfunctory review.
```

Button:

```text
Continue
```

Keep cards short. The goal is to give the user a fast mental handle, not a dictionary entry.

---

# Phase 2: Practice Loop

The app quizzes today’s words until each word becomes **Recall Ready**.

Use three question types internally:

1. meaning recognition
2. reverse recall
3. SAT-style usage

The user experiences these as one mixed practice flow.

---

## Question Type A: Meaning Recognition

Shows the word. User chooses the meaning.

```text
Equivocal most nearly means:

A) unclear or open to multiple meanings
B) harmful or hostile
C) careless and routine
D) logically convincing
```

---

## Question Type B: Reverse Recall

Shows the meaning. User chooses the word.

```text
Which word means “careless, routine, done with little effort”?

A) assiduous
B) perfunctory
C) cogent
D) inimical
```

---

## Question Type C: SAT-Style Usage

Shows a short sentence with difficult answer choices.

```text
The editor’s review was merely ______; she approved the article after a quick glance and missed several obvious errors.

A) assiduous
B) perfunctory
C) equivocal
D) cogent
```

Correct answer: `perfunctory`

---

# Mastery Logic

Each word has a daily status:

## New

The word has been introduced but not tested.

## Shaky

The user missed it or marked that they guessed.

## Stable

The user answered it correctly, but not across all required question types.

## Recall Ready

The user answered it correctly across all three question types:

- meaning recognition
- reverse recall
- SAT-style usage

A word should not become Recall Ready after one correct answer.

---

# Loop Behavior

The practice loop should:

- mix all of today’s words;
- show weaker words more often;
- briefly reteach missed words;
- avoid repeating the exact same question immediately;
- continue until all words are Recall Ready;
- end gracefully if the user reaches the question cap.

Recommended question cap:

```text
45 total questions
```

If the user hits the cap before finishing:

```text
Good work. 4 of 6 words are recall-ready.
The remaining words will lead your next session.
```

---

# Mistake Handling

After a wrong answer, show a compact correction immediately.

Example:

```text
Not quite.

Equivocal
Fast meaning: unclear or open to multiple meanings.
```

Button:

```text
Continue
```

The missed word should return later in the loop.

---

# Guess Handling

After a correct answer, occasionally ask:

```text
Did you know it or guess?
```

Options:

```text
Knew it
Guessed
```

If the user chooses `Guessed`, keep the word Shaky.

For MVP, ask this only after correct SAT-style usage questions to avoid annoying the user.

---

# Completion Screen

When all words are Recall Ready, show:

```text
Today’s words are recall-ready.
```

List the words:

```text
perfunctory
assiduous
equivocal
inimical
cogent
specious
```

Show simple stats:

```text
6 words learned
31 questions answered
4 words needed extra review
6 / 6 words recall-ready
```

Primary button:

```text
Finish
```

Optional secondary button:

```text
Keep practicing
```

If the user hit the question cap, show:

```text
Session complete.

4 / 6 words recall-ready.
The remaining words will lead your next session.
```

---

# Required Screens

Only build these screens for MVP:

1. **Home Screen**

   - shows today’s session
   - start / continue button

2. **Learn Card Screen**

   - one word card at a time

3. **Question Screen**

   - one question at a time
   - multiple-choice answers

4. **Correction Screen**

   - shown after wrong answers

5. **Guess Check Screen**

   - shown occasionally after correct SAT-style usage questions

6. **Completion Screen**

   - shows today’s results

No separate word library is needed for this MVP.

---

# Content Requirements

The app should generate practice from the existing word dataset.

For MVP, each word needs enough information to support:

- one learn card;
- meaning recognition questions;
- reverse recall questions;
- SAT-style usage questions;
- brief correction screens.

SAT-style usage questions can be generated from templates at first, but they must feel natural and have one clearly correct answer.

Avoid joke answers or obviously easy distractors. The answer choices should all be difficult SAT-plausible words.

---

# Future-Proofing Requirements

Keep the MVP narrow, but avoid designing it as a dead end.

The product should be able to support later:

- different daily word counts;
- more question types;
- older-word review;
- diagnostic placement;
- personal weak-word decks;
- challenge mode;
- multiple word banks;
- different exams or difficulty levels.

To support that, the app should treat the session as a flexible learning loop:

```text
select words → introduce words → quiz words → update mastery → repeat until done
```

Do not hard-code the experience around one fixed sequence like:

```text
learn all words → do recognition → do reverse recall → do SAT questions → finish
```

The user experience should feel simple, but the underlying session model should allow the app to change the mix of questions later.

---

# Out of Scope

Do not build:

- onboarding
- diagnostic test
- challenge mode
- full SAT sections
- grammar questions
- reading comprehension
- user-created decks
- social features
- streaks
- badges
- leaderboards
- complex analytics
- large word browser
- parent or teacher accounts
- time-based session limit

---

# MVP Summary

Build one excellent loop:

> The user opens the app, starts today’s session, learns a small set of hard words, practices them in mixed formats, gets corrections, repeats weak words, and finishes when every word is recall-ready or the question cap is reached.

The app should feel like:

> “I know exactly what to do today.”

Not:

> “Here are many study options.”
