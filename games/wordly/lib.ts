/**
 * Word Hunt's rules kernel: the word lists, guess validation and the letter
 * scoring. Separate from game.ts so the views can import the mark type
 * (type-only, erased at build time) without dragging the word lists into
 * every phone's view bundle.
 */

import answersJson from './assets/answers.en.json' with { type: 'json' };
import allowedJson from './assets/allowed.en.json' with { type: 'json' };

/** green: right letter, right spot. yellow: in the word, elsewhere. grey: not in it. */
export type Mark = 'green' | 'yellow' | 'grey';

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

const WORD_RE = /^[a-z]{5}$/;

/** The answer pool — filtered, so a typo in an asset can never break a game. */
export const ANSWERS: string[] = (answersJson as string[]).filter((w) => WORD_RE.test(w));

/** Guess whitelist: answers ∪ allowed, so every possible answer is guessable. */
const ALLOWED = new Set<string>([
  ...ANSWERS,
  ...(allowedJson as string[]).filter((w) => WORD_RE.test(w)),
]);

export function isAllowedGuess(word: string): boolean {
  return ALLOWED.has(word);
}

/**
 * Clean up a guess coming off the wire (assume a hostile client): returns the
 * lowercase word, or null when it is not five plain letters.
 */
export function normalizeGuess(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 32) return null;
  const word = raw.trim().toLowerCase();
  return WORD_RE.test(word) ? word : null;
}

export function pickAnswer(random: () => number): string {
  const i = Math.floor(random() * ANSWERS.length);
  return ANSWERS[i] ?? ANSWERS[0] ?? 'apple';
}

/**
 * Two passes, and in this order — the classic double-letter bug is scoring in
 * one pass. First mark the exact hits and count only the answer letters they
 * did NOT consume; then hand out yellows from what is left, so a guess with
 * two of a letter against an answer with one gets exactly one colour.
 */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array.from({ length: guess.length }, (): Mark => 'grey');
  const left = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    const a = answer[i]!;
    if (guess[i] === a) marks[i] = 'green';
    else left.set(a, (left.get(a) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'green') continue;
    const g = guess[i]!;
    const spare = left.get(g) ?? 0;
    if (spare > 0) {
      marks[i] = 'yellow';
      left.set(g, spare - 1);
    }
  }
  return marks;
}

const RANK: Record<Mark, number> = { grey: 1, yellow: 2, green: 3 };

/** Best mark seen so far for each letter — the on-screen keyboard's tints. */
export function mergeKeys(
  keys: Record<string, Mark>,
  word: string,
  marks: Mark[],
): Record<string, Mark> {
  const next = { ...keys };
  for (let i = 0; i < word.length; i++) {
    const letter = word[i]!;
    const mark = marks[i] ?? 'grey';
    const prev = next[letter];
    if (prev === undefined || RANK[mark] > RANK[prev]) next[letter] = mark;
  }
  return next;
}
