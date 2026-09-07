"use client";

import { useEffect, useMemo, useState } from "react";

import { StudyAppShell } from "@/components/study/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { VocabWord } from "@/lib/study/types";
import { createClient } from "@/lib/supabase/client";

export function SentenceWritingClient() {
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [sentence, setSentence] = useState("");
  const [words, setWords] = useState<VocabWord[]>([]);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        setError("Sign in to practice sentence writing.");
        return;
      }

      const { data: mastery } = await supabase
        .from("user_word_mastery")
        .select("vocab_word:vocab_words(id, word, fast_meaning, example_sentence, sort_order)")
        .eq("user_id", user.id)
        .neq("status", "known")
        .limit(20);

      setWords(
        (mastery ?? []).flatMap((row) => {
          const value = row.vocab_word as unknown as VocabWord | VocabWord[] | null;
          const word = Array.isArray(value) ? value[0] : value;
          return word ? [word] : [];
        }),
      );
    })();
  }, [supabase]);

  const word = words[wordIndex];

  return (
    <StudyAppShell>
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <Badge className="w-fit" variant="secondary">Productive recall</Badge>
          <CardTitle>Use the word in a sentence</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {word ? (
            <>
              <div>
                <p className="text-3xl font-semibold">{word.word}</p>
                <p className="mt-1 text-muted-foreground">{word.fast_meaning}</p>
              </div>
              <Textarea
                maxLength={500}
                onChange={(event) => setSentence(event.target.value)}
                placeholder={`Write a sentence using “${word.word}.”`}
                value={sentence}
              />
              <div className="flex flex-wrap gap-3">
                <Button disabled={!sentence.trim()} onClick={() => setShowExample(true)} type="button">
                  Compare with example
                </Button>
                <Button
                  disabled={words.length < 2}
                  onClick={() => {
                    setWordIndex((index) => (index + 1) % words.length);
                    setSentence("");
                    setShowExample(false);
                  }}
                  type="button"
                  variant="outline"
                >
                  Next word
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Study some words before starting this exercise.</p>
          )}
          {showExample && word ? (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-medium">Example usage</p>
              <p className="mt-2 text-sm text-muted-foreground">{word.example_sentence}</p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </StudyAppShell>
  );
}
