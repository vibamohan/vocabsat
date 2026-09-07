"use client";

import { Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { speakText } from "@/lib/study/speech";

export function SpeechButton({ label, text }: { label: string; text: string }) {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported("speechSynthesis" in window);
  }, []);

  if (!isSupported) {
    return null;
  }

  return (
    <Button
      aria-label={label}
      onClick={() => speakText(text)}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Volume2 />
    </Button>
  );
}
