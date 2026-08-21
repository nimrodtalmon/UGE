import { cmpEval, evaluate7, type PCard } from './engine.js';
import type { Stage } from './game.js';

/**
 * A hold'em player that sees exactly what a person in that seat sees: its own
 * two cards, the board, the pot, the price of a call and everybody's chips.
 * Nothing here is ever handed another seat's hole cards or the rest of the
 * deck — `Read` below is the whole of the bot's world, and it is built (in
 * game.ts) from public state plus this seat's own hand.
 */

/** One seat's view of the table at the moment it has to act. */
export interface Read {
  /** This seat's own two cards. */
  hole: PCard[];
  /** The community cards — face up for everyone. */
  board: PCard[];
  stage: Stage;
  /** Everything already in the middle, this street included. */
  pot: number;
  /** Price of calling, capped at this seat's stack (0 = it can check). */
  toCall: number;
  chips: number;
  streetBet: number;
  currentBet: number;
  minRaise: number;
  bb: number;
  /** False while facing an incomplete all-in raise: call or fold only. */
  canRaise: boolean;
  /** Opponents still in the hand. */
  opponents: number;
  /** Opponents still to act behind this seat on this street (position). */
  toActAfter: number;
  level: string;
  random: () => number;
}

export type Action = { name: 'fold' } | { name: 'call' } | { name: 'raise'; to: number };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// -------------------------------------------------------------- preflop

/** Chen-style points: high card value, doubled for a pair, suited and connected. */
const chenBase = (r: number): number =>
  r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2;

/**
 * Two cards, no board: a compact ranking rather than a lookup table. Aces are
 * about 1, a suited connector sits mid-table, seven-deuce lands at the bottom.
 */
export function preflopStrength(hole: PCard[]): number {
  const [hi, lo] = [...hole].sort((a, b) => b.r - a.r);
  if (!hi || !lo) return 0;
  let pts = chenBase(hi.r);
  if (hi.r === lo.r) {
    pts = Math.max(5, pts * 2);
  } else {
    if (hi.s === lo.s) pts += 2;
    const gap = hi.r - lo.r - 1;
    pts -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && hi.r < 12) pts += 1; // small connectors make straights
  }
  return clamp01((pts + 1) / 21);
}

// ------------------------------------------------------------- postflop

/** Longest run of consecutive ranks present (ace counts low as well). */
function longestRun(ranks: number[]): number {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  const arr = [...set].sort((a, b) => a - b);
  let run = 1;
  let best = 1;
  for (let i = 1; i < arr.length; i++) {
    run = arr[i]! - arr[i - 1]! === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

const CATEGORY = [0.12, 0.45, 0.68, 0.82, 0.88, 0.92, 0.96, 0.99, 1];

/** How good the made hand is, 0..1, judged only from own cards plus the board. */
export function madeStrength(hole: PCard[], board: PCard[], stage: Stage): number {
  const score = evaluate7([...hole, ...board]);
  const cat = score[0]!;
  if (board.length >= 5 && cmpEval(score, evaluate7(board)) === 0) return 0.15; // playing the board
  let v = CATEGORY[cat] ?? 0.5;
  if (cat === 0) v += (score[1]! - 2) / 100; // high card: the kicker is all there is
  if (cat === 1) {
    const pairRank = score[1]!;
    const boardHigh = Math.max(...board.map((c) => c.r));
    if (!hole.some((c) => c.r === pairRank)) v = 0.3; // the board's pair — everyone has it
    else v = pairRank >= boardHigh ? 0.6 : 0.42; // top pair / overpair, or worse
  }
  if (stage !== 'river') {
    const all = [...hole, ...board];
    const suits = [0, 1, 2, 3].map((s) => all.filter((c) => c.s === s).length);
    const flushDraw = suits.some((n, s) => n === 4 && hole.some((c) => c.s === s));
    if (flushDraw) v = Math.max(v, 0.52);
    if (longestRun(all.map((c) => c.r)) >= 4) v = Math.max(v, 0.46);
  }
  return clamp01(v);
}

export const strengthOf = (r: Read): number =>
  r.board.length >= 3 ? madeStrength(r.hole, r.board, r.stage) : preflopStrength(r.hole);

/** Chance of holding the best hand once every live opponent is counted. */
export const equityOf = (strength: number, opponents: number): number =>
  Math.pow(strength, 1 + 0.45 * (Math.max(1, opponents) - 1));

// ------------------------------------------------------------- decisions

/**
 * The nearest legal `raise to` at or above `want`, or null when this seat may
 * not raise at all: a raise has to clear the min-raise or be exactly all-in.
 */
export function raiseTo(r: Read, want: number): number | null {
  if (!r.canRaise) return null;
  const maxTo = r.streetBet + r.chips;
  if (maxTo <= r.currentBet) return null; // not enough chips to raise anybody
  let to = Math.max(Math.round(want), r.currentBet + r.minRaise);
  if (to > maxTo) to = maxTo; // all-in is allowed to fall short of a min-raise
  if (to <= r.currentBet) return null;
  if (to < r.currentBet + r.minRaise && to !== maxTo) return null;
  return to;
}

const CALL: Action = { name: 'call' };
const FOLD: Action = { name: 'fold' };

/** Raise to a share of the pot when that is legal, otherwise fall back. */
function bet(r: Read, share: number, fallback: Action): Action {
  const pot = Math.max(r.bb, r.pot);
  const to = raiseTo(r, r.currentBet + Math.max(r.minRaise, Math.round(pot * share)));
  return to === null ? fallback : { name: 'raise', to };
}

/** Calls and checks along, folds to a real bet with nothing, raises the nuts. */
function easy(r: Read, strength: number): Action {
  if (r.toCall === 0) return strength > 0.8 ? bet(r, 0.5, CALL) : CALL;
  if (strength >= 0.85) return bet(r, 0.6, CALL);
  const big = Math.max(r.bb * 3, r.chips * 0.25);
  if (strength < 0.45 && r.toCall > big) return FOLD;
  if (strength < 0.2 && r.toCall > r.bb * 2) return FOLD;
  return CALL;
}

/** Pot odds: pay when the price is below the chance of winning. */
function priced(r: Read, equity: number, loosen: number): Action {
  const pot = Math.max(r.bb, r.pot);
  if (r.toCall === 0) return equity > 0.55 - loosen ? bet(r, 0.6, CALL) : CALL;
  if (equity > 0.78 - loosen) return bet(r, 0.75, CALL);
  const odds = r.toCall / (pot + r.toCall);
  if (equity >= odds + 0.03 - loosen) return CALL;
  if (r.toCall <= r.bb && equity > 0.12) return CALL; // cheap enough to see one more
  return FOLD;
}

/**
 * Pick an action. Easy plays along, Normal prices every call, Sharp adds
 * position and the occasional bluff-raise.
 */
export function decide(r: Read): Action {
  const strength = strengthOf(r);
  const equity = equityOf(strength, r.opponents);
  if (r.level === 'easy') return easy(r, strength);
  if (r.level !== 'sharp') return priced(r, equity, 0);

  // sharp: acting last is worth a wider range, and now and then a bluff
  const inPosition = r.toActAfter === 0;
  const pot = Math.max(r.bb, r.pot);
  const bluffable = r.opponents <= 2 && r.toCall <= pot * 0.35 && equity < 0.5;
  if (bluffable && inPosition && r.random() < 0.1) {
    const to = raiseTo(r, r.currentBet + Math.max(r.minRaise, Math.round(pot * 0.6)));
    if (to !== null) return { name: 'raise', to };
  }
  return priced(r, equity, inPosition ? 0.05 : 0);
}
