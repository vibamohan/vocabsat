export function getSpeechText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(". ");
}

export function speakText(text: string, rate = 1) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Math.min(2, Math.max(0.5, rate));
  window.speechSynthesis.speak(utterance);
  return true;
}
