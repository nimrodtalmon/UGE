/**
 * Sudoku rules, solver and generator. Pure and JSON-able; shared by game.ts
 * and the views (the views only ever get the conflict helpers — the solution
 * never leaves the server).
 *
 * A grid is a flat array of 81 digits, row-major, 0 meaning blank.
 * Digits are 1..9; candidate sets are 9-bit masks (bit d-1 = digit d).
 */

export const N = 9;
export const CELLS = 81;
const ALL = 0x1ff;

export const rowOf = (i: number): number => (i / 9) | 0;
export const colOf = (i: number): number => i % 9;
/** The box index (0..8) of a cell. */
export const boxOf = (i: number): number => ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);

/** Cells sharing a row, column or box with i (20 of them), precomputed once. */
export const PEERS: number[][] = (() => {
  const out: number[][] = [];
  for (let i = 0; i < CELLS; i++) {
    const peers: number[] = [];
    for (let j = 0; j < CELLS; j++) {
      if (j === i) continue;
      if (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i)) peers.push(j);
    }
    out.push(peers);
  }
  return out;
})();

const bits = (mask: number): number => {
  let n = 0;
  let m = mask;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
};

/** Deterministic Fisher-Yates over ctx.random — never Math.random. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Work cap for the solver, so generation can never run away with the server. */
export interface Budget {
  n: number;
}

/**
 * Count solutions of `grid`, stopping at `limit`. Picks the most constrained
 * cell first, so a well-formed puzzle is settled in a few hundred nodes.
 * If the budget runs out it reports `limit` — "assume ambiguous", which only
 * ever makes the generator keep a clue it might have been able to drop.
 */
export function countSolutions(
  grid: number[],
  limit: number,
  budget: Budget,
  out?: number[],
): number {
  const work = grid.slice();
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);
  for (let i = 0; i < CELLS; i++) {
    const d = work[i]!;
    if (d === 0) continue;
    const b = 1 << (d - 1);
    const r = rowOf(i);
    const c = colOf(i);
    const x = boxOf(i);
    // a contradictory grid has no solutions at all
    if ((rows[r]! & b) !== 0 || (cols[c]! & b) !== 0 || (boxes[x]! & b) !== 0) return 0;
    rows[r]! |= b;
    cols[c]! |= b;
    boxes[x]! |= b;
  }

  const step = (): number => {
    if (budget.n-- <= 0) return limit;
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < CELLS; i++) {
      if (work[i] !== 0) continue;
      const mask = ALL & ~(rows[rowOf(i)]! | cols[colOf(i)]! | boxes[boxOf(i)]!);
      const count = bits(mask);
      if (count === 0) return 0;
      if (count < bestCount) {
        bestCount = count;
        bestMask = mask;
        best = i;
        if (count === 1) break;
      }
    }
    if (best < 0) {
      if (out) for (let i = 0; i < CELLS; i++) out[i] = work[i]!;
      return 1;
    }
    const r = rowOf(best);
    const c = colOf(best);
    const x = boxOf(best);
    let found = 0;
    for (let d = 1; d <= 9 && found < limit; d++) {
      const b = 1 << (d - 1);
      if ((bestMask & b) === 0) continue;
      work[best] = d;
      rows[r]! |= b;
      cols[c]! |= b;
      boxes[x]! |= b;
      found += step();
      work[best] = 0;
      rows[r]! &= ~b;
      cols[c]! &= ~b;
      boxes[x]! &= ~b;
    }
    return found;
  };

  return step();
}

/** Solve a puzzle known to be well-formed; null when it has no solution. */
export function solve(grid: number[]): number[] | null {
  const out = new Array<number>(CELLS).fill(0);
  const budget: Budget = { n: 500_000 };
  return countSolutions(grid, 1, budget, out) === 1 ? out : null;
}

/**
 * A complete valid grid. Built from the canonical pattern
 * `(3(r mod 3) + floor(r/3) + c) mod 9`, then run through the symmetries that
 * preserve validity: relabel the digits, shuffle rows inside each band, the
 * bands themselves, likewise columns and stacks, and maybe transpose. Instant,
 * and about 10^11 distinct grids — no backtracking to blow the time budget.
 */
export function fullGrid(random: () => number): number[] {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const order = (): number[] => {
    const bands = shuffle([0, 1, 2], random);
    const out: number[] = [];
    for (const b of bands) for (const k of shuffle([0, 1, 2], random)) out.push(b * 3 + k);
    return out;
  };
  const rows = order();
  const cols = order();
  const flip = random() < 0.5;
  const grid = new Array<number>(CELLS).fill(0);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const sr = rows[r]!;
      const sc = cols[c]!;
      const base = (3 * (sr % 3) + ((sr / 3) | 0) + sc) % 9;
      grid[flip ? c * 9 + r : r * 9 + c] = digits[base]!;
    }
  }
  return grid;
}

export interface Puzzle {
  puzzle: number[];
  solution: number[];
  clues: number;
}

/**
 * Dig holes out of a full grid while the solver still reports exactly one
 * solution, in 180°-symmetric pairs (the look every printed sudoku has).
 * Stops at `targetClues` or when every pair has been tried — the puzzle is
 * always uniquely solvable, whichever comes first.
 */
export function makePuzzle(random: () => number, targetClues: number): Puzzle {
  const solution = fullGrid(random);
  const puzzle = solution.slice();
  const budget: Budget = { n: 400_000 };

  const units: number[][] = [];
  for (let i = 0; i < 40; i++) units.push([i, 80 - i]);
  units.push([40]);

  let clues = CELLS;
  for (const unit of shuffle(units, random)) {
    if (clues <= targetClues) break;
    const saved = unit.map((i) => puzzle[i]!);
    for (const i of unit) puzzle[i] = 0;
    if (countSolutions(puzzle, 2, budget) === 1) {
      clues -= unit.length;
    } else {
      unit.forEach((i, k) => {
        puzzle[i] = saved[k]!;
      });
    }
  }
  return { puzzle, solution, clues };
}

/**
 * Cells holding a digit that repeats in their row, column or box. Derived
 * purely from what is on screen, so the views can compute it themselves and
 * nothing about the answer has to be sent.
 */
export function conflicts(digits: number[]): boolean[] {
  const bad = new Array<boolean>(CELLS).fill(false);
  for (let i = 0; i < CELLS; i++) {
    const d = digits[i] ?? 0;
    if (d === 0) continue;
    for (const j of PEERS[i]!) {
      if ((digits[j] ?? 0) === d) {
        bad[i] = true;
        break;
      }
    }
  }
  return bad;
}

/** MM:SS — used by isOver and by the views' clock. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
