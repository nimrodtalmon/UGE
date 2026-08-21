import { ALLOWED_WORDS, scoreGuess } from './lib.js';
import type { Mark } from './lib.js';

/**
 * An honest word hunter. The answer sits in the game state and is deliberately
 * never passed in here: the only input is this bot's OWN rows — the words it
 * guessed and the green/yellow/grey it got back. It keeps the list of words
 * still consistent with that feedback (by re-scoring each candidate as if it
 * were the answer, with the game's own scoreGuess, so double letters behave)
 * and guesses out of that list. It can and does run out of tries.
 *
 * Candidates come from the whole guessable vocabulary, never from the smaller
 * pool the answer is actually drawn from: knowing which words the game likes
 * to pick would be a second kind of peeking, and it made the bot unbeatable.
 */

/** One of this bot's own guesses, as the board shows it to everyone. */
export interface BotRow {
  word: string;
  marks: Mark[];
}

const sameMarks = (a: Mark[], b: Mark[]): boolean =>
  a.length === b.length && a.every((m, i) => m === b[i]);

/** Words that would have produced exactly the feedback we have been given. */
export function consistent(rows: BotRow[]): string[] {
  if (rows.length === 0) return [...ALLOWED_WORDS];
  return ALLOWED_WORDS.filter((word) =>
    rows.every((r) => sameMarks(scoreGuess(r.word, word), r.marks)),
  );
}

const pickOne = <T>(items: T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/** How common each word's letters are among the words still in play. */
function frequencyRank(words: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const w of words) for (const letter of new Set(w)) freq.set(letter, (freq.get(letter) ?? 0) + 1);
  const rank = new Map<string, number>();
  for (const w of words) {
    let total = 0;
    for (const letter of new Set(w)) total += freq.get(letter) ?? 0;
    rank.set(w, total);
  }
  return rank;
}

/** The candidates whose letters are the most ordinary, best first. */
function byFrequency(words: string[], rank = frequencyRank(words)): string[] {
  return [...words].sort((a, b) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0) || (a < b ? -1 : 1));
}

/** Work caps: a turn has to stay a few milliseconds on the brain. */
const MAX_PROBES = 60;
const MAX_TARGETS = 200;

/**
 * The guess that leaves the fewest words standing in the worst case. Bounded:
 * at most MAX_PROBES candidate guesses tried against at most MAX_TARGETS
 * possible answers.
 */
function minimax(words: string[], random: () => number): string {
  if (words.length <= 2) return pickOne(words, random);
  const ranked = byFrequency(words);
  const probes = ranked.slice(0, MAX_PROBES);
  const targets = ranked.slice(0, MAX_TARGETS);
  let best: string[] = [];
  let bestWorst = Infinity;
  for (const guess of probes) {
    const buckets = new Map<string, number>();
    let worst = 0;
    for (const target of targets) {
      const key = scoreGuess(guess, target).join('');
      const size = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, size);
      if (size > worst) worst = size;
    }
    if (worst < bestWorst) {
      bestWorst = worst;
      best = [guess];
    } else if (worst === bestWorst) {
      best.push(guess);
    }
  }
  return best.length > 0 ? pickOne(best, random) : ranked[0]!;
}

/** The word to send next, from this bot's own feedback alone. */
export function pickGuess(rows: BotRow[], level: string, random: () => number): string {
  const words = consistent(rows);
  // can't happen with honest feedback, but never leave the game without a move
  if (words.length === 0) return pickOne(ALLOWED_WORDS, random);

  if (level === 'easy') {
    // sloppy: three times in ten it throws a word it has no reason to believe
    if (random() < 0.3) return pickOne(ALLOWED_WORDS, random);
    return pickOne(words, random);
  }
  if (level === 'sharp') return minimax(words, random);

  const rank = frequencyRank(words);
  const ranked = byFrequency(words, rank);
  const best = rank.get(ranked[0]!);
  return pickOne(ranked.filter((w) => rank.get(w) === best), random);
}

/** The bot's pace: a guess every few seconds, not one per platform beat. */
const SLOT_MS = 1_500;

/**
 * True during a 1.5s slot — wide enough that a polling client always lands in
 * one. Spending a guess shifts the phase by two, which shuts the current slot
 * immediately (no two guesses in one breath) and reopens 4.5s later (6s on
 * easy). Seats are staggered so they don't all type at once.
 */
export function readyToGuess(now: number, seat: number, used: number, level: string): boolean {
  const period = level === 'easy' ? 6 : 5;
  const slot = Math.floor(now / SLOT_MS) + seat + used * 2;
  return ((slot % period) + period) % period === 0;
}
