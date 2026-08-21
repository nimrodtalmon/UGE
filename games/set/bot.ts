/**
 * An honest set-spotter. Difficulty here is REACTION TIME, not accuracy: the
 * bot never claims three cards that are not a set (it works from findSets, so
 * a bad claim is impossible by construction) — it is simply slower or faster
 * at seeing one, and it does not always see every set that is there.
 *
 * Determinism: the platform hands a bot `Math.random` as ctx.random, and a bot
 * is asked for a move several times a second, so anything rolled fresh on each
 * beat would flicker (a "spotted" set would come and go). Everything here is
 * therefore drawn from a small PRNG SEEDED FROM STATE — the board's serial
 * number, the seat and the level — so the same table always produces the same
 * hesitation and the same blind spots, and the answer is stable between beats.
 */

import { findSets } from './lib.js';
import type { Card } from './lib.js';

/** How long a level stares at a fresh table before it claims, in ms. */
const WINDOW: Record<string, [number, number]> = {
  easy: [6_000, 9_000],
  normal: [3_000, 5_000],
  sharp: [1_500, 2_500],
};

/** Chance that any one set on the table is noticed at all. */
const SPOT: Record<string, number> = { easy: 0.5, normal: 0.7, sharp: 0.85 };

/**
 * A second, slower look. Without it a bot that noticed nothing would sit on a
 * set forever and, alone at the table, hang the game — so after this much
 * longer it eventually sees them all.
 */
const SECOND_LOOK_MS = 4_000;

/**
 * The platform asks the bots for a move about once a second, which is coarser
 * than the gap between two bots' reaction times — so on every table whichever
 * seat is polled first would win, and seat 1 would take the whole game. Each
 * table therefore picks ONE seat to be the quick one and pushes the rest back
 * by more than a poll, and the pick rotates with the table. The quick seat
 * still reacts at its level's real speed, which is what a human plays against.
 */
const STAGGER_MS = 1_200;

const windowOf = (level: string): [number, number] => WINDOW[level] ?? WINDOW['normal']!;
const spotOf = (level: string): number => SPOT[level] ?? SPOT['normal']!;

/** mulberry32 — small, fast, and good enough to space out hesitations. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const levelCode = (level: string): number => {
  let h = 0;
  for (let i = 0; i < level.length; i++) h = (h * 31 + level.charCodeAt(i)) | 0;
  return h;
};

/** Where this seat comes in the pecking order for this particular table. */
function rankOf(serial: number, seat: number, seats: number): number {
  const random = seeded(Math.imul(serial + 1, 0x27d4eb2d));
  const order = Array.from({ length: Math.max(1, seats) }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const rank = order.indexOf(seat);
  return rank < 0 ? 0 : rank;
}

/**
 * What this bot would claim on this table, or null while it is still looking.
 * `elapsed` is how long the current table has been up (ctx.now − boardAt).
 */
export function pickClaim(
  board: (Card | null)[],
  serial: number,
  seat: number,
  seats: number,
  level: string,
  elapsed: number,
): number[] | null {
  const sets = findSets(board);
  if (sets.length === 0) return null;

  const random = seeded(Math.imul(serial + 1, 0x9e3779b1) ^ Math.imul(seat + 1, 0x85ebca6b) ^ levelCode(level));
  const [lo, hi] = windowOf(level);
  const wait = lo + (hi - lo) * random() + rankOf(serial, seat, seats) * STAGGER_MS;
  // one draw per set, always in the same order — the blind spots are fixed
  // for this table, so the bot does not "re-see" a set every beat
  const spot = spotOf(level);
  const spotted = sets.filter(() => random() < spot);

  const pick = (from: number[][]): number[] =>
    from[Math.min(from.length - 1, Math.floor(random() * from.length))]!;

  if (elapsed >= wait && spotted.length > 0) return pick(spotted);
  if (elapsed >= wait + SECOND_LOOK_MS) return pick(sets);
  return null;
}
