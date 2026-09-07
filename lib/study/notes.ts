export const MAX_WORD_NOTE_LENGTH = 2_000;

export function normalizeWordNote(value: string) {
  return value.trim().slice(0, MAX_WORD_NOTE_LENGTH);
}
