import { Chess } from 'chess.js';
import type { Move } from 'chess.js';

/**
 * A small negamax engine. Easy plays loose, Normal looks a move ahead, Hard
 * searches deeper — all within a few milliseconds, since it runs on the brain
 * between polls.
 */

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// centre-loving bonus for the pieces that care, from white's point of view
const CENTRE = [
  0, 1, 2, 3, 3, 2, 1, 0,
  1, 2, 3, 4, 4, 3, 2, 1,
  2, 3, 5, 6, 6, 5, 3, 2,
  3, 4, 6, 8, 8, 6, 4, 3,
  3, 4, 6, 8, 8, 6, 4, 3,
  2, 3, 5, 6, 6, 5, 3, 2,
  1, 2, 3, 4, 4, 3, 2, 1,
  0, 1, 2, 3, 3, 2, 1, 0,
];

const squareIndex = (sq: string): number => {
  const file = sq.charCodeAt(0) - 97; // a..h
  const rank = 8 - Number(sq[1]); // 8..1 → 0..7
  return rank * 8 + file;
};

/** Score the position for the side to move (positive = better for them). */
function evaluate(chess: Chess): number {
  const turn = chess.turn();
  let score = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const mine = piece.color === turn ? 1 : -1;
      let v = VALUE[piece.type] ?? 0;
      if (piece.type === 'n' || piece.type === 'b' || piece.type === 'p') {
        v += (CENTRE[squareIndex(piece.square)] ?? 0) * 2;
      }
      // pawns are worth more the closer they get to promoting
      if (piece.type === 'p') {
        const rank = Number(piece.square[1]);
        v += (piece.color === 'w' ? rank - 2 : 7 - rank) * 4;
      }
      score += mine * v;
    }
  }
  return score;
}

/** Captures first, then checks — cheap ordering that makes alpha-beta bite. */
function ordered(chess: Chess): Move[] {
  const moves = chess.moves({ verbose: true }) as Move[];
  return moves.sort((a, b) => rank(b) - rank(a));
  function rank(m: Move): number {
    let r = 0;
    if (m.captured) r += 10 * (VALUE[m.captured] ?? 0) - (VALUE[m.piece] ?? 0);
    if (m.promotion) r += 800;
    if (m.san.includes('+')) r += 50;
    return r;
  }
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number): number {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) return -100000 - depth; // being mated is worst, sooner is worse
    return 0; // stalemate / draw
  }
  if (depth === 0) return evaluate(chess);
  let best = -Infinity;
  for (const m of ordered(chess)) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -beta, -alpha);
    chess.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Pick a move for the side to move at the given difficulty. */
export function pickMove(fen: string, level: string, random: () => number): { from: string; to: string } | null {
  const chess = new Chess(fen);
  const moves = ordered(chess);
  if (moves.length === 0) return null;

  if (level === 'easy') {
    // mostly random, but never miss a free capture or a mate in one
    for (const m of moves) {
      chess.move(m);
      const mate = chess.isCheckmate();
      chess.undo();
      if (mate) return { from: m.from, to: m.to };
    }
    const pick = moves[Math.floor(random() * moves.length)]!;
    return { from: pick.from, to: pick.to };
  }

  const depth = level === 'hard' ? 3 : 2;
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -Infinity, Infinity);
    chess.undo();
    // jitter breaks ties so the bot doesn't repeat one line every game
    const jittered = score + random() * 8;
    if (jittered > bestScore) {
      bestScore = jittered;
      best = m;
    }
  }
  const chosen = best ?? moves[0]!;
  return { from: chosen.from, to: chosen.to };
}
