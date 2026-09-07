import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import type { VocabWord } from "@/lib/study/types";

export function WordEnrichment({ word }: { word: VocabWord }) {
  const wordParts = [
    ...(word.prefixes ?? []),
    ...(word.roots ?? []),
    ...(word.suffixes ?? []),
  ];
  const imageUrl = getVocabImageUrl(word.image_path);

  if (
    wordParts.length === 0 &&
    !word.etymology &&
    (word.confusable_words?.length ?? 0) === 0 &&
    !imageUrl
  ) {
    return null;
  }

  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-3">
        {wordParts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {wordParts.map((part) => (
              <Badge key={part} variant="outline">
                {part}
              </Badge>
            ))}
          </div>
        ) : null}
        {word.etymology ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Origin: </span>
            {word.etymology}
          </p>
        ) : null}
        {(word.confusable_words?.length ?? 0) > 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Don’t confuse: </span>
            {word.confusable_words?.join(", ")}
          </p>
        ) : null}
      </div>
      {imageUrl ? (
        <figure className="w-full sm:w-40">
          <Image
            alt={word.image_alt ?? `Visual mnemonic for ${word.word}`}
            className="aspect-square rounded-md object-cover"
            height={160}
            src={imageUrl}
            unoptimized
            width={160}
          />
          {word.image_attribution ? (
            <figcaption className="mt-1 text-xs text-muted-foreground">
              {word.image_attribution}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
    </div>
  );
}

export function getVocabImageUrl(path: string | null | undefined) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!path || !supabaseUrl || path.includes("..")) {
    return null;
  }

  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${supabaseUrl}/storage/v1/object/public/vocab-images/${encodedPath}`;
}
