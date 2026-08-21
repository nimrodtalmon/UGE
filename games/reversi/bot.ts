import { SIZE, countDiscs, flipsFor, legalMoves } from './rules.js';

/**
 * Reversi AI. Easy plays any legal square, Normal is greedy over a
 * corner-and-edge weighting, Sharp searches four plies with alpha-beta over
 * the same weights plus mobility. Disc count barely matters until the end —
 * corners and having moves left do — so the weights, not the score, drive it.
 */

/** Classic positional weights: corners are gold, the squares beside them poison. */
const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

const WIN = 1_000_000;

/** Board after `seat` plays cell `at` (caller guarantees it is legal). */
function apply(board: number[], at: number, seat: number): number[] {
  const next = [...board];
  next[at] = seat;
  for (const i of flipsFor(board, at % SIZE, Math.floor(at / SIZE), seat)) next[i] = seat;
  return next;
}

/** Positional score of a board for `me` (higher is better). */
function positional(board: number[], me: number): number {
  let score = 0;
  for (let i = 0; i < board.length; i++) {
    const c = board[i];
    if (c === -1 || c === undefined) continue;
    score += (c === me ? 1 : -1) * (WEIGHTS[i] ?? 0);
  }
  return score;
}

/** Nobody can move: the majority takes it. */
function terminal(board: number[], me: number): number {
  const [black, white] = countDiscs(board);
  const diff = me === 0 ? black - white : white - black;
  return diff === 0 ? 0 : diff > 0 ? WIN + diff : -WIN + diff;
}

function evaluate(board: number[], me: number): number {
  const foe = me === 0 ? 1 : 0;
  const mobility = legalMoves(board, me).length - legalMoves(board, foe).length;
  return positional(board, me) + mobility * 10;
}

/** Negamax with alpha-beta, handling Reversi's pass rule. */
function search(board: number[], me: number, depth: number, alpha: number, beta: number, passed: boolean): number {
  const foe = me === 0 ? 1 : 0;
  const opts = legalMoves(board, me);
  if (opts.length === 0) {
    if (passed) return terminal(board, me); // neither side can move
    return -search(board, foe, depth, -beta, -alpha, true);
  }
  if (depth === 0) return evaluate(board, me);
  // corners first: cheap ordering that makes alpha-beta bite
  const ordered = [...opts].sort((a, b) => (WEIGHTS[b] ?? 0) - (WEIGHTS[a] ?? 0));
  let best = -Infinity;
  for (const at of ordered) {
    const score = -search(apply(board, at, me), foe, depth - 1, -beta, -alpha, false);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Pick a square for `seat` at the given difficulty, or null when it cannot move. */
export function pickPlace(
  board: number[],
  seat: number,
  level: string,
  random: () => number,
): { x: number; y: number } | null {
  const opts = legalMoves(board, seat);
  if (opts.length === 0) return null;
  const cell = (at: number) => ({ x: at % SIZE, y: Math.floor(at / SIZE) });

  if (level === 'easy') return cell(opts[Math.floor(random() * opts.length)] ?? opts[0]!);

  const foe = seat === 0 ? 1 : 0;
  let bestAt = opts[0]!;
  let bestScore = -Infinity;
  for (const at of opts) {
    const next = apply(board, at, seat);
    const score =
      level === 'sharp'
        ? -search(next, foe, 3, -Infinity, Infinity, false)
        : positional(next, seat);
    // a whisker of jitter breaks ties so the bot varies its openings
    const jittered = score + random() * 2;
    if (jittered > bestScore) {
      bestScore = jittered;
      bestAt = at;
    }
  }
  return cell(bestAt);
}
