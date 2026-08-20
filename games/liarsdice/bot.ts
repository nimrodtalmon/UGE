import type { Bid } from './game.js';

/**
 * A Liar's Dice player that knows exactly what a person in that seat knows:
 * its own cup, the number of dice everyone still holds, and the bid on the
 * table. The other cups are in the state and are never read here — the bot
 * bluffs and calls on probability alone.
 */

/** Below this chance of the bid being true, the bot calls dudo. */
const DOUBT: Record<string, number> = { easy: 0.2, normal: 0.35, sharp: 0.45 };

export const doubtOf = (level: string): number => DOUBT[level] ?? DOUBT['normal']!;

/** Ones are wild, so any unknown die matches a bid face one time in three. */
const MATCH = 1 / 3;

const choose = (n: number, k: number): number => {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
};

/** P(at least `need` of `unknown` unseen dice show the bid face). */
export function atLeast(unknown: number, need: number): number {
  if (need <= 0) return 1;
  if (need > unknown) return 0;
  let p = 0;
  for (let k = need; k <= unknown; k++) {
    p += choose(unknown, k) * MATCH ** k * (1 - MATCH) ** (unknown - k);
  }
  return p;
}

/** How many of my own dice count towards `face` (wild ones included). */
export const mine = (dice: number[], face: number): number =>
  dice.filter((d) => d === face || d === 1).length;

/**
 * Nobody bids a face they hold none of, so a bid is evidence in itself: credit
 * the bidder with some of their own cup before judging the claim. Without this
 * the bot doubts perfectly ordinary bids and hands over a die for the privilege.
 */
export const credit = (bidderDice: number): number =>
  bidderDice <= 0 ? 0 : Math.min(bidderDice, Math.max(1, Math.round(bidderDice * 0.45)));

/**
 * The chance the bid on the table is good, seen from this cup: my own matching
 * dice plus what the bidder is likely sitting on, and one unknown die in three
 * for the rest (ones are wild).
 */
export function holds(bid: Bid, dice: number[], total: number, bidderDice: number): number {
  const backed = credit(bidderDice);
  const unknown = Math.max(0, total - dice.length - backed);
  return atLeast(unknown, bid.quantity - mine(dice, bid.face) - backed);
}

/** The face this cup is heaviest in — the cheapest one to bluff about. */
export function favourite(dice: number[], random: () => number): number {
  let best = 2;
  let bestCount = -1;
  for (const face of [2, 3, 4, 5, 6]) {
    // a nudge of noise so two equally-held faces don't always resolve the same way
    const count = mine(dice, face) + random() * 0.5;
    if (count > bestCount) {
      bestCount = count;
      best = face;
    }
  }
  return best;
}

/** The cheapest raise that leans on `face`: same quantity if it can, else one more die. */
const minimalRaise = (bid: Bid, face: number): Bid =>
  face > bid.face ? { quantity: bid.quantity, face } : { quantity: bid.quantity + 1, face };

export type Action = { kind: 'dudo' } | { kind: 'bid'; quantity: number; face: number };

/**
 * Decide this turn. Raises are minimal — same quantity on a higher face when
 * possible, otherwise one more die — and lean on the face the bot actually
 * holds. A bid that would go past every die in play is never made: the bot
 * calls instead.
 */
export function decide(
  bid: Bid | null,
  dice: number[],
  total: number,
  bidderDice: number,
  level: string,
  random: () => number,
): Action {
  const face = favourite(dice, random);

  if (bid === null) {
    // opening bid: what this cup shows, plus a share of what it cannot see
    const unknown = Math.max(0, total - dice.length);
    const bold = level === 'easy' ? 0 : Math.floor(unknown * MATCH);
    const quantity = Math.max(1, Math.min(total, mine(dice, face) + bold));
    return { kind: 'bid', quantity, face };
  }

  if (holds(bid, dice, total, bidderDice) < doubtOf(level)) return { kind: 'dudo' };

  const raised = minimalRaise(bid, face);
  // no room left to raise inside the dice in play — the only move is to call
  if (raised.quantity > total) return { kind: 'dudo' };
  return { kind: 'bid', quantity: raised.quantity, face: raised.face };
}
