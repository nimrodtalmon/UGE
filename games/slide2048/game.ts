import type { GameDef } from '../../src/shared/plugin.js';

/**
 * 2048 — the sliding-tile number game, one player, one phone.
 *
 * Standard rules: every swipe packs the whole board toward one edge, merging
 * equal neighbours from the far edge inward, and a tile born from a merge may
 * not merge again in the same swipe. A swipe that changes nothing is rejected
 * (the move returns the same state), which is what keeps a dead swipe from
 * gifting a free tile. Reaching 2048 raises a flag but does not end the run —
 * the game is over only when the board is full and no merge is left anywhere.
 */

export const SIZE = 4;
const CELLS = SIZE * SIZE;
const WIN_TILE = 2048;

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface Slide2048State {
  /** Row-major board, `SIZE * SIZE` cells; 0 is an empty cell. */
  grid: number[];
  score: number;
  moves: number;
  /** Sticky once a 2048 tile appears; the run may continue. */
  won: boolean;
  /** Cells created by the last move (merge results + the spawned tile). */
  fresh: number[];
  /** Bumped on every accepted move, so views can restart tile animations. */
  gen: number;
}

export interface Slide2048View extends Slide2048State {
  /** Highest tile on the board. */
  best: number;
  /** False once the board is full with no merge available in any direction. */
  canMove: boolean;
}

function isDirection(dir: unknown): dir is Direction {
  return typeof dir === 'string' && (DIRECTIONS as readonly string[]).includes(dir);
}

/** Board indices of one row/column, ordered from the far edge inward. */
function lineIndices(dir: Direction, k: number): number[] {
  const idx: number[] = [];
  for (let j = 0; j < SIZE; j++) {
    idx.push(dir === 'left' || dir === 'right' ? k * SIZE + j : j * SIZE + k);
  }
  if (dir === 'right' || dir === 'down') idx.reverse();
  return idx;
}

/** Pack one line toward index 0, merging each tile at most once. */
function collapse(values: number[]): { line: number[]; gained: number; mergedAt: number[] } {
  const packed = values.filter((v) => v !== 0);
  const line: number[] = [];
  const mergedAt: number[] = [];
  let gained = 0;
  for (let i = 0; i < packed.length; i++) {
    const v = packed[i]!;
    if (packed[i + 1] === v) {
      line.push(v * 2);
      mergedAt.push(line.length - 1);
      gained += v * 2;
      i++; // the merged pair is consumed — the new tile cannot merge again
    } else {
      line.push(v);
    }
  }
  while (line.length < SIZE) line.push(0);
  return { line, gained, mergedAt };
}

/** Apply a swipe. `moved` is false when nothing shifted and nothing merged. */
function slideGrid(
  grid: number[],
  dir: Direction,
): { grid: number[]; gained: number; merged: number[]; moved: boolean } {
  const next = [...grid];
  const merged: number[] = [];
  let gained = 0;
  for (let k = 0; k < SIZE; k++) {
    const idx = lineIndices(dir, k);
    const result = collapse(idx.map((i) => grid[i]!));
    gained += result.gained;
    for (let pos = 0; pos < SIZE; pos++) next[idx[pos]!] = result.line[pos]!;
    for (const pos of result.mergedAt) merged.push(idx[pos]!);
  }
  const moved = next.some((v, i) => v !== grid[i]);
  return { grid: next, gained, merged, moved };
}

/** Drop a 2 (90%) or a 4 (10%) into a random empty cell. */
function addTile(grid: number[], random: () => number): { grid: number[]; at: number } | null {
  const empty: number[] = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0) empty.push(i);
  if (empty.length === 0) return null;
  const at = empty[Math.min(empty.length - 1, Math.floor(random() * empty.length))]!;
  const next = [...grid];
  next[at] = random() < 0.9 ? 2 : 4;
  return { grid: next, at };
}

function freshState(random: () => number, gen: number): Slide2048State {
  let grid = new Array<number>(CELLS).fill(0);
  const fresh: number[] = [];
  for (let n = 0; n < 2; n++) {
    const added = addTile(grid, random);
    if (!added) break;
    grid = added.grid;
    fresh.push(added.at);
  }
  return { grid, score: 0, moves: 0, won: false, fresh, gen };
}

export function bestTile(grid: number[]): number {
  return grid.reduce((m, v) => (v > m ? v : m), 0);
}

/** Any empty cell, or any pair of equal orthogonal neighbours. */
export function canMove(grid: number[]): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r * SIZE + c]!;
      if (v === 0) return true;
      if (c + 1 < SIZE && grid[r * SIZE + c + 1] === v) return true;
      if (r + 1 < SIZE && grid[(r + 1) * SIZE + c] === v) return true;
    }
  }
  return false;
}

const game: GameDef<Slide2048State, Slide2048View> = {
  setup({ random }) {
    return freshState(random, 1);
  },

  moves: {
    slide(state, ctx, dir: unknown) {
      if (ctx.role === 'table') return state; // the table is display-only
      if (!isDirection(dir)) return state;

      const swipe = slideGrid(state.grid, dir);
      if (!swipe.moved) return state; // dead swipe: no shift, no merge, no new tile

      const added = addTile(swipe.grid, ctx.random);
      const grid = added ? added.grid : swipe.grid;
      const fresh = added ? [...swipe.merged, added.at] : swipe.merged;
      return {
        grid,
        score: state.score + swipe.gained,
        moves: state.moves + 1,
        won: state.won || grid.some((v) => v >= WIN_TILE),
        fresh,
        gen: state.gen + 1,
      };
    },

    restart(state, ctx) {
      if (ctx.role === 'table') return state; // the table is display-only
      return freshState(ctx.random, state.gen + 1);
    },
  },

  playerView(state) {
    return { ...state, best: bestTile(state.grid), canMove: canMove(state.grid) };
  },

  isOver(state) {
    if (canMove(state.grid)) return null;
    return { text: `🔢 Game over — score ${state.score} (best tile ${bestTile(state.grid)})` };
  },
};

export default game;
