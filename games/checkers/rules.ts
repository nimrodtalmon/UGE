/**
 * English draughts (American checkers) rules — pure, JSON-able, shared by
 * game.ts, bot.ts and the views. Kept out of game.ts so the bot can import
 * the rules without a cycle.
 *
 * Board: 64 squares, index = row * 8 + col, row 0 at the TOP. Only the dark
 * squares ((row + col) odd) are ever occupied. Seat 0 is red and moves UP the
 * board (towards row 0); seat 1 is black and moves DOWN (towards row 7).
 */

export type Cell = '' | 'r' | 'R' | 'b' | 'B';
export type Board = Cell[];
export type Side = 0 | 1;

export interface Step {
  from: number;
  to: number;
  /** Square of the jumped piece, or null for a quiet move. */
  cap: number | null;
}

export interface Position {
  board: Board;
  turn: Side;
  /** Square of a piece mid multi-jump: only it may move, and only by jumping. */
  chain: number | null;
}

export const rowOf = (i: number): number => (i / 8) | 0;
export const colOf = (i: number): number => i % 8;
export const isDark = (i: number): boolean => (rowOf(i) + colOf(i)) % 2 === 1;

export const sideOf = (c: Cell): Side | null =>
  c === 'r' || c === 'R' ? 0 : c === 'b' || c === 'B' ? 1 : null;
export const isKing = (c: Cell): boolean => c === 'R' || c === 'B';

/** Twelve a side on the three dark rows nearest each player. */
export function initialBoard(): Board {
  const board: Board = Array<Cell>(64).fill('');
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue;
    const r = rowOf(i);
    if (r <= 2) board[i] = 'b';
    else if (r >= 5) board[i] = 'r';
  }
  return board;
}

const MAN_DIRS: Record<Side, [number, number][]> = {
  0: [
    [-1, -1],
    [-1, 1],
  ],
  1: [
    [1, -1],
    [1, 1],
  ],
};
const KING_DIRS: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/** Every move the piece on `from` could make, quiet ones included. */
function stepsFrom(board: Board, from: number): Step[] {
  const cell = board[from] ?? '';
  const side = sideOf(cell);
  if (side === null) return [];
  const r = rowOf(from);
  const c = colOf(from);
  const dirs = isKing(cell) ? KING_DIRS : MAN_DIRS[side];
  const out: Step[] = [];
  for (const [dr, dc] of dirs) {
    const r1 = r + dr;
    const c1 = c + dc;
    if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) continue;
    const mid = r1 * 8 + c1;
    const midCell = board[mid] ?? '';
    if (midCell === '') {
      out.push({ from, to: mid, cap: null });
      continue;
    }
    if (sideOf(midCell) === side) continue;
    const r2 = r + 2 * dr;
    const c2 = c + 2 * dc;
    if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
    const land = r2 * 8 + c2;
    if ((board[land] ?? '') === '') out.push({ from, to: land, cap: mid });
  }
  return out;
}

/**
 * The legal moves in a position. Capturing is mandatory: when any jump
 * exists, only jumps are returned. Mid-chain, only the chaining piece moves.
 */
export function legalSteps(pos: Position): Step[] {
  if (pos.chain !== null) {
    return stepsFrom(pos.board, pos.chain).filter((s) => s.cap !== null);
  }
  const quiet: Step[] = [];
  const jumps: Step[] = [];
  for (let i = 0; i < 64; i++) {
    if (sideOf(pos.board[i] ?? '') !== pos.turn) continue;
    for (const s of stepsFrom(pos.board, i)) (s.cap === null ? quiet : jumps).push(s);
  }
  return jumps.length > 0 ? jumps : quiet;
}

/** Does the side to move have a capture available? (Then it is forced.) */
export function mustCapture(pos: Position): boolean {
  return legalSteps(pos).some((s) => s.cap !== null);
}

export interface Applied extends Position {
  crowned: boolean;
}

/**
 * Play one step. Crowning ends the turn even when more jumps are on offer —
 * the standard English rule. A jumper that can jump again keeps the turn.
 */
export function applyStep(pos: Position, step: Step): Applied {
  const board = pos.board.slice();
  const piece = board[step.from] ?? '';
  board[step.from] = '';
  if (step.cap !== null) board[step.cap] = '';
  const lastRow = pos.turn === 0 ? 0 : 7;
  const crowned = !isKing(piece) && rowOf(step.to) === lastRow;
  board[step.to] = crowned ? (pos.turn === 0 ? 'R' : 'B') : piece;
  const chains =
    step.cap !== null &&
    !crowned &&
    stepsFrom(board, step.to).some((s) => s.cap !== null);
  return {
    board,
    turn: chains ? pos.turn : ((1 - pos.turn) as Side),
    chain: chains ? step.to : null,
    crowned,
  };
}

/** Men and kings left, per seat. */
export function counts(board: Board): [number, number] {
  const out: [number, number] = [0, 0];
  for (const c of board) {
    const s = sideOf(c);
    if (s !== null) out[s]++;
  }
  return out;
}
