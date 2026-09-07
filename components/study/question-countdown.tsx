"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { getRemainingSeconds } from "@/lib/study/countdown";

export function QuestionCountdown({
  onTimeout,
  seconds,
}: {
  onTimeout: () => void;
  seconds: number;
}) {
  const deadlineRef = useRef(Date.now() + seconds * 1_000);
  const timeoutHandledRef = useRef(false);
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const update = () => {
      const nextRemaining = getRemainingSeconds(deadlineRef.current, Date.now());
      setRemaining(nextRemaining);

      if (nextRemaining === 0 && !timeoutHandledRef.current) {
        timeoutHandledRef.current = true;
        onTimeout();
      }
    };
    const interval = window.setInterval(update, 250);
    update();
    return () => window.clearInterval(interval);
  }, [onTimeout]);

  return (
    <Badge aria-live="polite" variant={remaining <= 5 ? "destructive" : "outline"}>
      {remaining}s
    </Badge>
  );
}
