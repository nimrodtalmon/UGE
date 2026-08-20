import type { MemoryCard } from './game.js';

/**
 * An honest memory player. The state carries every card's face, so a naive bot
 * would pair the board up instantly; instead the bot only ever looks at cards
 * that were publicly turned face up at some point (`state.seen`), and even then
 * remembers each one with a per-level probability.
 */

/** How often the bot actually recalls a face it has been shown. */
const RECALL: Record<string, number> = { easy: 0.25, normal: 0.6, sharp: 0.95 };

export const recallOf = (level: string): number => RECALL[level] ?? RECALL['normal']!;

interface Board {
  /** Face-down cards, the only ones worth flipping. */
  down: number[];
  /** The card already flipped this turn, if any. */
  up: number | null;
  /** Face-down cards the bot is allowed to know: shown to the table earlier. */
  known: number[];
}

/** Split the board into what any player at the table can see and remember. */
export function read(cards: MemoryCard[], seen: number[]): Board {
  const down: number[] = [];
  let up: number | null = null;
  cards.forEach((c, i) => {
    if (c.state === 'down') down.push(i);
    else if (c.state === 'up' && up === null) up = i;
  });
  const shown = new Set(seen);
  return { down, up, known: down.filter((i) => shown.has(i)) };
}

const faceOf = (cards: MemoryCard[], i: number): string => cards[i]?.face ?? '';

/**
 * The card to flip, or null when there is nothing to flip. `roll` is one draw
 * from ctx.random: below the recall probability the bot uses its memory, above
 * it it simply guesses — that is what makes an easy bot beatable.
 */
export function pick(cards: MemoryCard[], seen: number[], recall: number, roll: number, spin: number): number | null {
  const { down, up, known } = read(cards, seen);
  if (down.length === 0) return null;
  const guess = (): number => down[Math.min(down.length - 1, Math.floor(spin * down.length))]!;
  if (roll >= recall) return guess();

  if (up !== null) {
    // second flip: do we remember where this face's twin is?
    const want = faceOf(cards, up);
    const twin = known.find((i) => faceOf(cards, i) === want);
    return twin ?? guess();
  }
  // first flip: do we remember a full pair among the cards we have been shown?
  for (const i of known) {
    if (known.some((j) => j !== i && faceOf(cards, j) === faceOf(cards, i))) return i;
  }
  return guess();
}
