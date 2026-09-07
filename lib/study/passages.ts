export function blankPassageWord(passage: string, word: string) {
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return passage.replace(new RegExp(`\\b${escapedWord}\\b`, "gi"), "______");
}

export function isPassageAnswerCorrect(answer: string, word: string) {
  return answer.trim().toLocaleLowerCase() === word.trim().toLocaleLowerCase();
}
