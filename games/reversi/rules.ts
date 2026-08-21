/**
 * Board primitives, kept out of game.ts so the bot can use them without an
 * import cycle (game.ts → bot.ts → rules.ts).
 */

export const SIZE = 8;

const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Every disc flipped by playing (x, y) as `seat`; empty means the move is illegal. */
export function flipsFor(board: number[], x: number, y: number, seat: number): number[] {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return [];
  if (board[y * SIZE + x] !== -1) return [];
  const foe = seat === 0 ? 1 : 0;
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const run: number[] = [];
    let cx = x + dx;
    let cy = y + dy;
    while (cx >= 0 && cx < SIZE && cy >= 0 && cy < SIZE && board[cy * SIZE + cx] === foe) {
      run.push(cy * SIZE + cx);
      cx += dx;
      cy += dy;
    }
    // an outflanked line only counts when one of ours closes it
    if (run.length > 0 && cx >= 0 && cx < SIZE && cy >= 0 && cy < SIZE && board[cy * SIZE + cx] === seat) {
      out.push(...run);
    }
  }
  return out;
}

/** Cells `seat` may legally play. */
export function legalMoves(board: number[], seat: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== -1) continue;
    if (flipsFor(board, i % SIZE, Math.floor(i / SIZE), seat).length > 0) out.push(i);
  }
  return out;
}

export function countDiscs(board: number[]): [number, number] {
  let black = 0;
  let white = 0;
  for (const c of board) {
    if (c === 0) black++;
    else if (c === 1) white++;
  }
  return [black, white];
}

/** The four discs in the middle: white on the diagonal, black on the anti-diagonal. */
export function startBoard(): number[] {
  const board: number[] = Array(SIZE * SIZE).fill(-1);
  const m = SIZE / 2;
  board[(m - 1) * SIZE + (m - 1)] = 1;
  board[(m - 1) * SIZE + m] = 0;
  board[m * SIZE + (m - 1)] = 0;
  board[m * SIZE + m] = 1;
  return board;
}
