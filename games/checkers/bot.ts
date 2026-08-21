/**
 * Checkers AI. Easy plays anything legal, Normal looks three plies ahead,
 * Sharp searches five with alpha-beta and a fuller evaluation. All pure —
 * randomness only ever comes from the ctx.random handed in.
 *
 * A ply here is one STEP, so a multi-jump chain (which keeps the turn) is
 * searched as several plies by the same side; the search asks whose turn the
 * position says it is rather than flipping sign blindly.
 */
import type { Board, Position, Side, Step } from './rules.js';
import { applyStep, colOf, isKing, legalSteps, rowOf, sideOf } from './rules.js';

const MAN = 100;
const KING = 175;
const WIN = 1_000_000;

/** Score the board for `me`: material, kings, how far the men have marched. */
function evaluate(board: Board, me: Side, deep: boolean): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const cell = board[i] ?? '';
    const side = sideOf(cell);
    if (side === null) continue;
    const king = isKing(cell);
    let v = king ? KING : MAN;
    const r = rowOf(i);
    if (!king) v += (side === 0 ? 7 - r : r) * 6; // advancement towards crowning
    if (deep) {
      const homeRow = side === 0 ? 7 : 0;
      if (!king && r === homeRow) v += 14; // a held back row is a crowning wall
      const c = colOf(i);
      if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 6; // centre control
      if (c === 0 || c === 7) v += 3; // edges cannot be jumped
    }
    score += side === me ? v : -v;
  }
  return score;
}

function search(pos: Position, depth: number, alpha: number, beta: number, me: Side, deep: boolean): number {
  const steps = legalSteps(pos);
  if (steps.length === 0) {
    // The side to move is stuck (no pieces, or nothing legal) and has lost.
    return pos.turn === me ? -(WIN + depth) : WIN + depth;
  }
  if (depth <= 0) return evaluate(pos.board, me, deep);

  const kids = steps.map((s) => applyStep(pos, s));
  if (deep && kids.length > 1) {
    // Cheap ordering so alpha-beta actually bites.
    const maximizing = pos.turn === me;
    kids.sort((a, b) => {
      const d = evaluate(b.board, me, deep) - evaluate(a.board, me, deep);
      return maximizing ? d : -d;
    });
  }

  if (pos.turn === me) {
    let best = -Infinity;
    for (const kid of kids) {
      const v = search(kid, depth - 1, alpha, beta, me, deep);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const kid of kids) {
    const v = search(kid, depth - 1, alpha, beta, me, deep);
    if (v < best) best = v;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Pick a step for the side to move. Never returns an illegal one. */
export function pickStep(pos: Position, level: string, random: () => number): Step | null {
  const steps = legalSteps(pos);
  if (steps.length === 0) return null;
  if (steps.length === 1) return steps[0] ?? null;

  if (level === 'easy') {
    return steps[Math.floor(random() * steps.length) % steps.length] ?? steps[0] ?? null;
  }

  const deep = level === 'sharp';
  const depth = deep ? 5 : 3;
  const me = pos.turn;
  let best: Step | null = null;
  let bestScore = -Infinity;
  for (const step of steps) {
    const score =
      search(applyStep(pos, step), depth - 1, -Infinity, Infinity, me, deep) + random() * 2;
    if (score > bestScore) {
      bestScore = score;
      best = step;
    }
  }
  return best ?? steps[0] ?? null;
}
