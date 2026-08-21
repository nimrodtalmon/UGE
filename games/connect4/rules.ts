/**
 * Board primitives, kept out of game.ts so the bot can use them without an
 * import cycle (game.ts → bot.ts → rules.ts).
 */

export const COLS = 7;
export const ROWS = 6;

const DIRS: [number, number][] = [
  [1, 0], // →
  [0, 1], // ↓
  [1, 1], // ↘
  [1, -1], // ↗
];

/** Lowest empty row in a column, or -1 when it is full. */
export function landingRow(board: number[], x: number): number {
  for (let y = ROWS - 1; y >= 0; y--) if (board[y * COLS + x] === -1) return y;
  return -1;
}

/** Columns that still have room. */
export function openColumns(board: number[]): number[] {
  const open: number[] = [];
  for (let x = 0; x < COLS; x++) if (landingRow(board, x) >= 0) open.push(x);
  return open;
}

/** The four (or more) cells through `at` that make a line, or null. */
export function winningLine(board: number[], at: number): number[] | null {
  const seat = board[at];
  if (seat === undefined || seat < 0) return null;
  const x0 = at % COLS;
  const y0 = Math.floor(at / COLS);
  for (const [dx, dy] of DIRS) {
    const line = [at];
    for (const sign of [1, -1]) {
      let x = x0 + dx * sign;
      let y = y0 + dy * sign;
      while (x >= 0 && x < COLS && y >= 0 && y < ROWS && board[y * COLS + x] === seat) {
        line.push(y * COLS + x);
        x += dx * sign;
        y += dy * sign;
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b);
  }
  return null;
}
