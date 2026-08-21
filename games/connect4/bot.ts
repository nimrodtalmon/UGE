import { COLS, ROWS, landingRow, openColumns as roomy, winningLine } from './rules.js';

/**
 * Connect Four AI. Easy takes a win and blocks one but is otherwise loose,
 * Normal searches three plies with line scoring, Sharp searches five with
 * alpha-beta and a taste for the centre. All of it runs in a few milliseconds
 * on a plain array, because it runs on the brain between polls.
 */

const WIN = 1_000_000;

/** Every four-in-a-row window on the board, precomputed once. */
const WINDOWS: number[][] = (() => {
  const out: number[][] = [];
  const dirs: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      for (const [dx, dy] of dirs) {
        const ex = x + dx * 3;
        const ey = y + dy * 3;
        if (ex < 0 || ex >= COLS || ey < 0 || ey >= ROWS) continue;
        out.push([0, 1, 2, 3].map((k) => (y + dy * k) * COLS + (x + dx * k)));
      }
    }
  }
  return out;
})();

/** Columns with room left, centre first (cheap ordering that makes alpha-beta bite). */
function centreFirst(board: number[]): number[] {
  const mid = (COLS - 1) / 2;
  return roomy(board).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
}

/** Static score of a finished-searching position, for `me`. */
function evaluate(board: number[], me: number): number {
  const you = me === 0 ? 1 : 0;
  let score = 0;
  for (const w of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const i of w) {
      const c = board[i];
      if (c === me) mine++;
      else if (c === you) theirs++;
    }
    if (mine && theirs) continue; // a blocked window is worth nothing to anyone
    if (mine === 3) score += 50;
    else if (mine === 2) score += 10;
    else if (mine === 1) score += 1;
    else if (theirs === 3) score -= 60; // defending is worth a shade more
    else if (theirs === 2) score -= 12;
    else if (theirs === 1) score -= 1;
  }
  const centre = (COLS - 1) / 2;
  for (let y = 0; y < ROWS; y++) {
    const c = board[y * COLS + centre];
    if (c === me) score += 6;
    else if (c === you) score -= 6;
  }
  return score;
}

/** Negamax with alpha-beta; the board is a scratch copy and is restored. */
function search(board: number[], me: number, depth: number, alpha: number, beta: number): number {
  const opts = centreFirst(board);
  if (opts.length === 0) return 0; // full board — a draw
  if (depth === 0) return evaluate(board, me);
  const you = me === 0 ? 1 : 0;
  let best = -Infinity;
  for (const col of opts) {
    const at = landingRow(board, col) * COLS + col;
    board[at] = me;
    const won = winningLine(board, at) !== null;
    const score = won ? WIN + depth : -search(board, you, depth - 1, -beta, -alpha);
    board[at] = -1;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** A column that wins outright for `seat` right now, or null. */
function immediate(board: number[], seat: number): number | null {
  for (const col of centreFirst(board)) {
    const at = landingRow(board, col) * COLS + col;
    board[at] = seat;
    const won = winningLine(board, at) !== null;
    board[at] = -1;
    if (won) return col;
  }
  return null;
}

/** Pick a column for `seat` at the given difficulty, or null if the board is full. */
export function pickColumn(
  live: number[],
  seat: number,
  level: string,
  random: () => number,
): number | null {
  const board = [...live];
  const opts = centreFirst(board);
  if (opts.length === 0) return null;
  const you = seat === 0 ? 1 : 0;

  // every level takes a win, and none of them walks into an obvious loss
  const mine = immediate(board, seat);
  if (mine !== null) return mine;
  const theirs = immediate(board, you);
  if (theirs !== null) return theirs;

  if (level === 'easy') {
    // loose: mostly random, with a mild preference for the middle
    const weighted = opts.flatMap((c) => (Math.abs(c - (COLS - 1) / 2) <= 1 ? [c, c] : [c]));
    return weighted[Math.floor(random() * weighted.length)] ?? opts[0]!;
  }

  const depth = level === 'sharp' ? 5 : 3;
  let bestCol = opts[0]!;
  let bestScore = -Infinity;
  for (const col of opts) {
    const at = landingRow(board, col) * COLS + col;
    board[at] = seat;
    const score = -search(board, you, depth - 1, -Infinity, Infinity);
    board[at] = -1;
    // a whisker of jitter breaks ties so the bot varies its openings
    const jittered = score + random() * 2;
    if (jittered > bestScore) {
      bestScore = jittered;
      bestCol = col;
    }
  }
  return bestCol;
}
