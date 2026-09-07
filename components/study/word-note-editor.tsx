"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_WORD_NOTE_LENGTH,
  normalizeWordNote,
} from "@/lib/study/notes";
import { createClient } from "@/lib/supabase/client";

export function WordNoteEditor({
  userId,
  vocabWordId,
}: {
  userId?: string;
  vocabWordId: number;
}) {
  const supabase = useMemo(() => (userId ? createClient() : null), [userId]);
  const [mnemonic, setMnemonic] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!supabase || !userId) {
      return;
    }

    let isActive = true;
    setStatus("loading");

    void supabase
      .from("user_word_notes")
      .select("note, mnemonic")
      .eq("user_id", userId)
      .eq("vocab_word_id", vocabWordId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isActive) {
          return;
        }

        if (error) {
          setStatus("error");
          return;
        }

        setNote(data?.note ?? "");
        setMnemonic(data?.mnemonic ?? "");
        setStatus("idle");
      });

    return () => {
      isActive = false;
    };
  }, [supabase, userId, vocabWordId]);

  if (!supabase || !userId) {
    return null;
  }

  const handleSave = async () => {
    setStatus("saving");
    const { error } = await supabase.from("user_word_notes").upsert(
      {
        mnemonic: normalizeWordNote(mnemonic),
        note: normalizeWordNote(note),
        user_id: userId,
        vocab_word_id: vocabWordId,
      },
      { onConflict: "user_id,vocab_word_id" },
    );

    setStatus(error ? "error" : "saved");
  };

  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        My mnemonic and notes
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`mnemonic-${vocabWordId}`}>Mnemonic</Label>
          <Textarea
            disabled={status === "loading"}
            id={`mnemonic-${vocabWordId}`}
            maxLength={MAX_WORD_NOTE_LENGTH}
            onChange={(event) => setMnemonic(event.target.value)}
            placeholder="A memorable connection for this word"
            value={mnemonic}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`note-${vocabWordId}`}>Notes</Label>
          <Textarea
            disabled={status === "loading"}
            id={`note-${vocabWordId}`}
            maxLength={MAX_WORD_NOTE_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Usage, contrasts, or reminders"
            value={note}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            disabled={status === "loading" || status === "saving"}
            onClick={() => void handleSave()}
            size="sm"
            type="button"
            variant="outline"
          >
            {status === "saving" ? "Saving…" : "Save notes"}
          </Button>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {status === "saved"
              ? "Saved"
              : status === "error"
                ? "Unable to save notes"
                : null}
          </p>
        </div>
      </div>
    </details>
  );
}
