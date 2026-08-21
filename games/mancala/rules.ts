/**
 * Kalah — the six-pit-a-side Mancala everyone means by "Mancala". Pure and
 * JSON-able; shared by game.ts, bot.ts and the views.
 *
 * Pits are one flat array of 14, laid out anticlockwise:
 *   0..5   seat 0's pits      6  seat 0's store
 *   7..12  seat 1's pits     13  seat 1's store
 * Sowing walks the array upwards (mod 14) and skips the OTHER player's store.
 */

export type Side = 0 | 1;

export const PITS = 6;
export const SEEDS = 4;

export const storeOf = (side: Side): number => (side === 0 ? 6 : 13);
export const firstPit = (side: Side): number => (side === 0 ? 0 : 7);
/** The pit facing this one across the board. */
export const oppositeOf = (pit: number): number => 12 - pit;
export const ownerOf = (pit: number): Side => (pit <= 5 ? 0 : 1);
export const isPitOf = (pit: number, side: Side): boolean =>
  side === 0 ? pit >= 0 && pit <= 5 : pit >= 7 && pit <= 12;

export function initialPits(): number[] {
  const pits = Array<number>(14).fill(SEEDS);
  pits[6] = 0;
  pits[13] = 0;
  return pits;
}

/** The pits this side may legally pick up from. */
export function legalPits(pits: number[], side: Side): number[] {
  const out: number[] = [];
  for (let i = firstPit(side); i < firstPit(side) + PITS; i++) {
    if ((pits[i] ?? 0) > 0) out.push(i);
  }
  return out;
}

export function sideEmpty(pits: number[], side: Side): boolean {
  return legalPits(pits, side).length === 0;
}

export interface Sown {
  pits: number[];
  turn: Side;
  /** The move ended in the mover's own store: they go again. */
  again: boolean;
  /** Pits that received a seed, in sowing order. */
  path: number[];
  /** Where the last seed fell. */
  land: number;
  /** Seeds swept up by an end-in-an-empty-pit capture (0 when none). */
  captured: number;
  /** One side ran out: the other banked their leftovers and the game is done. */
  finished: boolean;
}

/**
 * Sow one pit. The caller must have checked it belongs to `side` and is not
 * empty (see legalPits) — this function trusts that and never mutates input.
 */
export function sow(pits: number[], side: Side, pit: number): Sown {
  const next = pits.slice();
  const mine = storeOf(side);
  const theirs = storeOf(side === 0 ? 1 : 0);
  let hand = next[pit] ?? 0;
  next[pit] = 0;
  const path: number[] = [];
  let at = pit;
  while (hand > 0) {
    at = (at + 1) % 14;
    if (at === theirs) continue; // never feed the opponent's store
    next[at] = (next[at] ?? 0) + 1;
    path.push(at);
    hand--;
  }

  const again = at === mine;
  let captured = 0;
  if (!again && isPitOf(at, side) && next[at] === 1) {
    const across = oppositeOf(at);
    const loot = next[across] ?? 0;
    if (loot > 0) {
      captured = loot + 1;
      next[mine] = (next[mine] ?? 0) + captured;
      next[at] = 0;
      next[across] = 0;
    }
  }

  // One side out of seeds ends it: everyone banks what is still on their side.
  let finished = false;
  if (sideEmpty(next, 0) || sideEmpty(next, 1)) {
    finished = true;
    for (const s of [0, 1] as Side[]) {
      let sum = 0;
      for (let i = firstPit(s); i < firstPit(s) + PITS; i++) {
        sum += next[i] ?? 0;
        next[i] = 0;
      }
      next[storeOf(s)] = (next[storeOf(s)] ?? 0) + sum;
    }
  }

  return {
    pits: next,
    turn: again ? side : ((1 - side) as Side),
    again,
    path,
    land: at,
    captured,
    finished,
  };
}
