/**
 * Mancala AI. Easy sows anywhere legal, Normal is greedy (free turns first,
 * then the fattest capture), Sharp searches six plies with alpha-beta on the
 * store difference. Pure — the only randomness is the ctx.random handed in.
 *
 * Landing in your own store does NOT pass the turn, so the search asks the
 * position whose move it is instead of flipping sign every ply.
 */
import type { Side } from './rules.js';
import { legalPits, sow, storeOf } from './rules.js';

const DECISIVE = 1000;

const diff = (pits: number[], me: Side): number =>
  (pits[storeOf(me)] ?? 0) - (pits[storeOf(me === 0 ? 1 : 0)] ?? 0);

function search(pits: number[], turn: Side, depth: number, alpha: number, beta: number, me: Side): number {
  const moves = legalPits(pits, turn);
  if (moves.length === 0) {
    // Game over — sow() has already banked the leftovers into the stores.
    const d = diff(pits, me);
    return d > 0 ? d + DECISIVE : d < 0 ? d - DECISIVE : d;
  }
  if (depth <= 0) return diff(pits, me);

  if (turn === me) {
    let best = -Infinity;
    for (const pit of moves) {
      const s = sow(pits, turn, pit);
      const v = search(s.pits, s.turn, depth - 1, alpha, beta, me);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const pit of moves) {
    const s = sow(pits, turn, pit);
    const v = search(s.pits, s.turn, depth - 1, alpha, beta, me);
    if (v < best) best = v;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Pick a pit for `turn` to sow. Never returns a pit the rules would reject. */
export function pickPit(pits: number[], turn: Side, level: string, random: () => number): number | null {
  const moves = legalPits(pits, turn);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0] ?? null;

  if (level === 'easy') {
    return moves[Math.floor(random() * moves.length) % moves.length] ?? moves[0] ?? null;
  }

  let best = moves[0] ?? null;
  let bestScore = -Infinity;
  for (const pit of moves) {
    const s = sow(pits, turn, pit);
    let score: number;
    if (level === 'sharp') {
      score = search(s.pits, s.turn, 5, -Infinity, Infinity, turn) + random();
    } else {
      // greedy: another turn beats everything, then the biggest capture,
      // then simply banking the most seeds.
      const gained = (s.pits[storeOf(turn)] ?? 0) - (pits[storeOf(turn)] ?? 0);
      score = (s.again ? 10_000 : 0) + s.captured * 100 + gained * 2 + random();
    }
    if (score > bestScore) {
      bestScore = score;
      best = pit;
    }
  }
  return best;
}
