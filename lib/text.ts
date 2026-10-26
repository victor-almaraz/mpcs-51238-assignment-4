// Small text helpers shared by the server and the interface.

/** The text with its first letter capitalized. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The text as a sentence: capitalized, ending in a full stop unless it already ends a sentence. */
export function sentence(s: string): string {
  const t = capitalize(s.trim());
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** A count with its noun, plural unless the count is one: "1 draft", "3 drafts". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}
