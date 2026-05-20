const EXAMPLE_SENTENCE_DELIMITER = "|";

export function getExampleSentences(exampleSentence: string) {
  return exampleSentence
    .split(EXAMPLE_SENTENCE_DELIMITER)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function getPrimaryExampleSentence(exampleSentence: string) {
  return getExampleSentences(exampleSentence)[0] ?? "";
}
