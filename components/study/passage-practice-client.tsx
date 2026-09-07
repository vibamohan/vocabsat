"use client";

import { useEffect, useMemo, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import { SpeechButton } from "@/components/study/speech-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { blankPassageWord, isPassageAnswerCorrect } from "@/lib/study/passages";
import { createClient } from "@/lib/supabase/client";

type PassageExercise = {
  explanation: string;
  passage: string;
  word: string;
};

export function PassagePracticeClient() {
  const supabase = useMemo(() => createClient(), []);
  const [answer, setAnswer] = useState("");
  const [exercises, setExercises] = useState<PassageExercise[]>([]);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    void supabase
      .from("vocab_passage_words")
      .select("explanation, passage:vocab_passages(passage), vocab_word:vocab_words(word)")
      .then(({ data }) => {
        setExercises(
          (data ?? []).flatMap((row) => {
            const passageValue = row.passage as unknown as { passage: string } | Array<{ passage: string }> | null;
            const wordValue = row.vocab_word as unknown as { word: string } | Array<{ word: string }> | null;
            const passage = Array.isArray(passageValue) ? passageValue[0] : passageValue;
            const word = Array.isArray(wordValue) ? wordValue[0] : wordValue;
            return passage && word
              ? [{ explanation: row.explanation, passage: passage.passage, word: word.word }]
              : [];
          }),
        );
      });
  }, [supabase]);

  const exercise = exercises[index];
  const prompt = exercise ? blankPassageWord(exercise.passage, exercise.word) : "";

  return (
    <StudyAppShell>
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <Badge className="w-fit" variant="secondary">Passage context</Badge>
          <CardTitle>Complete the passage</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {exercise ? (
            <>
              <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-5">
                <p className="flex-1 text-lg leading-relaxed">{prompt}</p>
                <SpeechButton label="Read passage aloud" text={prompt.replace("______", "blank")} />
              </div>
              <form
                className="flex gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFeedback(isPassageAnswerCorrect(answer, exercise.word) ? "correct" : "incorrect");
                }}
              >
                <Input aria-label="Missing word" autoComplete="off" onChange={(event) => setAnswer(event.target.value)} value={answer} />
                <Button disabled={!answer.trim()} type="submit">Check</Button>
              </form>
              {feedback ? (
                <div className="rounded-lg border p-4 text-sm">
                  <p className="font-medium">{feedback === "correct" ? "Correct" : `Answer: ${exercise.word}`}</p>
                  <p className="mt-1 text-muted-foreground">{exercise.explanation}</p>
                </div>
              ) : null}
              <Button
                disabled={exercises.length < 2}
                onClick={() => {
                  setIndex((current) => (current + 1) % exercises.length);
                  setAnswer("");
                  setFeedback(null);
                }}
                type="button"
                variant="outline"
              >
                Next passage
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No curated passage exercises are available yet.</p>
          )}
        </CardContent>
      </Card>
    </StudyAppShell>
  );
}
