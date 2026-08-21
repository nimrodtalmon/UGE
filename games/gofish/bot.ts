import { RANKS } from './game.js';
import type { AskEntry, GCard } from './game.js';

/**
 * A Go Fish opponent that plays the same memory game a person at the table
 * plays. It is handed its OWN hand and nothing else private: the ask log, the
 * hand sizes and the books are all face-up information. There is deliberately
 * no parameter here through which another seat's cards or the pond could
 * arrive, so the bot cannot cheat even by accident.
 *
 *  - easy   asks somebody at random for a rank it happens to hold;
 *  - normal listens: a player who ASKS for a rank holds it, a player who says
 *           "go fish" does not, so it asks whoever it last heard wanting one
 *           of its own ranks;
 *  - sharp  also remembers what it handed over and to whom (and how much),
 *           forgets a fact once the holder fished a fresh card or the rank was
 *           booked away, and leans on ranks it already holds three of.
 */

/** Everything one seat may legitimately use to choose an ask. */
export interface Seen {
  seat: number;
  /** This seat's own cards. */
  hand: GCard[];
  /** Cards in every hand, including this one — anyone can count them. */
  counts: number[];
  /** The ranks each seat has laid down face up. */
  books: number[][];
  /** Every ask the table has heard, oldest first. */
  log: AskEntry[];
  level: string;
  random: () => number;
}

export interface Ask {
  target: number;
  rank: number;
}

/** What the log says about "does seat X hold rank R?". */
type Belief = 'holds' | 'lacks' | 'unknown';

const beliefKey = (seat: number, rank: number): string => `${seat}:${rank}`;

/**
 * Replay the public log into a belief table.
 *
 * Two deductions any listener can make: you may only ask for a rank you hold,
 * so an ASKER holds what they asked for; and "go fish" means the TARGET has
 * none of it. Sharp adds the two refinements a careful player makes — a card
 * fished from the pond is unknown, so it wipes that seat's "lacks" (they may
 * just have drawn one), and a booked rank is gone from every hand.
 */
function beliefs(k: Seen): Map<string, Belief> {
  const table = new Map<string, Belief>();
  const sharp = k.level === 'sharp';

  for (const e of k.log) {
    // you may only ask for what you hold, and after a hit you hold even more
    table.set(beliefKey(e.asker, e.rank), 'holds');
    // the target either handed over every one of them or never had any
    table.set(beliefKey(e.target, e.rank), 'lacks');
    if (sharp) {
      if (e.drew && !e.drewMatch) {
        // an unknown card joined that hand: what it did not hold, it might now
        for (const r of RANKS) {
          if (table.get(beliefKey(e.asker, r)) === 'lacks') {
            table.set(beliefKey(e.asker, r), 'unknown');
          }
        }
      }
      if (e.booked !== null) {
        for (let s = 0; s < k.counts.length; s++) table.set(beliefKey(s, e.booked), 'lacks');
      }
    }
  }

  // a rank on the table is out of everybody's hand, whatever the log implied
  for (const laid of k.books) {
    for (const r of laid) {
      for (let s = 0; s < k.counts.length; s++) table.set(beliefKey(s, r), 'lacks');
    }
  }
  return table;
}

/** How many of `rank` this seat holds — used to prefer a nearly-full book. */
const holding = (k: Seen, rank: number): number => k.hand.filter((c) => c.r === rank).length;

/** Cards of `rank` this seat handed to `target` at some point, per the log. */
function gaveTo(k: Seen, target: number, rank: number): number {
  let n = 0;
  for (const e of k.log) {
    if (e.asker === target && e.target === k.seat && e.rank === rank) n += e.got;
    // ...and if they gave them back again, forget it
    if (e.asker === k.seat && e.target === target && e.rank === rank && e.got > 0) n = 0;
  }
  return n;
}

/**
 * The ask to make, or null when there is nobody to ask (the rules end the game
 * in that case, so it should not happen).
 */
export function pickAsk(k: Seen): Ask | null {
  const ranks = [...new Set(k.hand.map((c) => c.r))];
  const targets = k.counts.flatMap((n, i) => (i !== k.seat && n > 0 ? [i] : []));
  if (ranks.length === 0 || targets.length === 0) return null;

  const pick = <T,>(items: T[]): T =>
    items[Math.min(items.length - 1, Math.floor(k.random() * items.length))]!;

  if (k.level === 'easy') {
    return { target: pick(targets), rank: pick(ranks) };
  }

  const table = beliefs(k);
  const sharp = k.level === 'sharp';
  let best: Ask | null = null;
  let bestScore = -Infinity;

  for (const target of targets) {
    for (const rank of ranks) {
      const belief = table.get(beliefKey(target, rank)) ?? 'unknown';
      let score = belief === 'holds' ? 100 : belief === 'lacks' ? -100 : 0;
      // a fuller hand is likelier to hold any given rank
      score += Math.min(k.counts[target] ?? 0, 8) * 0.6;
      if (sharp) {
        // cards this seat handed over are still sitting in that hand
        const given = gaveTo(k, target, rank);
        if (given > 0 && belief !== 'lacks') score += 40 + given * 5;
        // three in hand: one card finishes the book
        const have = holding(k, rank);
        if (have === 3) score += 45;
        else if (have === 2) score += 12;
      }
      score += k.random() * 4; // never play the same losing line twice
      if (score > bestScore) {
        bestScore = score;
        best = { target, rank };
      }
    }
  }
  return best ?? { target: pick(targets), rank: pick(ranks) };
}
