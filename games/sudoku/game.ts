import type { GameDef } from '../../src/shared/plugin.js';
import { CELLS, PEERS, conflicts, formatClock, makePuzzle } from './rules.js';

/**
 * Solo Sudoku. The solved grid is the whole game, so it never leaves the
 * server: playerView ships the givens, the digits the player typed and their
 * pencil marks, and nothing else. Everything the phone highlights (clashes,
 * how many of a digit are placed) is derivable from what is already on
 * screen, so no hint about the answer has to be sent to derive it.
 */

export type SdStatus = 'playing' | 'won';

export interface SdState {
  /** The clues, 0 for a blank. Fixed for the run. */
  puzzle: number[];
  /** The unique answer — stripped in playerView, never sent to a client. */
  solution: number[];
  /** What the player typed, 0 for a blank. Always 0 where puzzle has a clue. */
  entries: number[];
  /** Pencil marks per cell as a 9-bit mask (bit d-1 = digit d). */
  marks: number[];
  /** Digits typed into a cell that already clashed with a row/column/box. */
  mistakes: number;
  clues: number;
  /** Server clock (ms) at deal, and when the grid was completed. */
  startedAt: number;
  endedAt: number | null;
  status: SdStatus;
}

export interface SdView {
  /** Clue or typed digit, 0 for blank — the grid as the player sees it. */
  digits: number[];
  givens: boolean[];
  marks: number[];
  mistakes: number;
  clues: number;
  status: SdStatus;
  startedAt: number;
  endedAt: number | null;
}

/** Clue counts per difficulty; mode config is opaque JSON, so clamp it. */
function clueTarget(config: Record<string, unknown>): number {
  const raw = config['clues'];
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 22 && raw <= 60) return raw;
  return 36;
}

function cellIndex(x: unknown, y: unknown): number | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < 0 || x > 8 || y < 0 || y > 8) return null;
  return y * 9 + x;
}

function digitOf(d: unknown): number | null {
  return typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 9 ? d : null;
}

/** The grid as it stands: clues plus whatever the player has typed. */
const shown = (state: SdState): number[] =>
  state.puzzle.map((clue, i) => (clue !== 0 ? clue : (state.entries[i] ?? 0)));

const elapsedOf = (state: SdState): number =>
  (state.endedAt ?? state.startedAt) - state.startedAt;

const game: GameDef<SdState, SdView> = {
  setup({ mode, random, now }) {
    const { puzzle, solution, clues } = makePuzzle(random, clueTarget(mode.config));
    return {
      puzzle,
      solution,
      entries: new Array<number>(CELLS).fill(0),
      marks: new Array<number>(CELLS).fill(0),
      mistakes: 0,
      clues,
      startedAt: now,
      endedAt: null,
      status: 'playing',
    };
  },

  moves: {
    /** Write a digit into a blank cell (or clear it, if it is already there). */
    place(state, ctx, x: number, y: number, d: number) {
      if (state.status !== 'playing') return state;
      if (ctx.role === 'table') return state; // the table is display-only
      const i = cellIndex(x, y);
      const digit = digitOf(d);
      if (i === null || digit === null) return state;
      if (state.puzzle[i] !== 0) return state; // clues are not editable

      const marks = [...state.marks];
      marks[i] = 0;
      const entries = [...state.entries];
      if (entries[i] === digit) {
        // tapping the same key again rubs it out — no mistake either way
        entries[i] = 0;
        return { ...state, entries, marks };
      }
      entries[i] = digit;

      const grid = state.puzzle.map((clue, k) => (clue !== 0 ? clue : (entries[k] ?? 0)));
      const clashes = PEERS[i]!.some((j) => (grid[j] ?? 0) === digit);
      // writing a digit rubs it out of the pencil marks it just invalidated
      for (const j of PEERS[i]!) marks[j] = (marks[j] ?? 0) & ~(1 << (digit - 1));

      const done = grid.every((v, k) => v === state.solution[k]);
      return {
        ...state,
        entries,
        marks,
        mistakes: state.mistakes + (clashes ? 1 : 0),
        status: done ? 'won' : 'playing',
        endedAt: done ? ctx.now : null,
      };
    },

    /** Toggle a pencil mark. Only on a blank, editable cell. */
    note(state, ctx, x: number, y: number, d: number) {
      if (state.status !== 'playing') return state;
      if (ctx.role === 'table') return state;
      const i = cellIndex(x, y);
      const digit = digitOf(d);
      if (i === null || digit === null) return state;
      if (state.puzzle[i] !== 0 || state.entries[i] !== 0) return state;
      const marks = [...state.marks];
      marks[i] = (marks[i] ?? 0) ^ (1 << (digit - 1));
      return { ...state, marks };
    },

    /** Rub a cell out — digit and pencil marks together. */
    erase(state, ctx, x: number, y: number) {
      if (state.status !== 'playing') return state;
      if (ctx.role === 'table') return state;
      const i = cellIndex(x, y);
      if (i === null) return state;
      if (state.puzzle[i] !== 0) return state;
      if (state.entries[i] === 0 && state.marks[i] === 0) return state;
      const entries = [...state.entries];
      const marks = [...state.marks];
      entries[i] = 0;
      marks[i] = 0;
      return { ...state, entries, marks };
    },
  },

  /** The solution stays on the server; the phone only ever gets the surface. */
  playerView(state) {
    return {
      digits: shown(state),
      givens: state.puzzle.map((clue) => clue !== 0),
      marks: [...state.marks],
      mistakes: state.mistakes,
      clues: state.clues,
      status: state.status,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
    };
  },

  isOver(state) {
    if (state.status !== 'won') return null;
    const slips = state.mistakes === 0 ? 'flawless' : `${state.mistakes} slip${state.mistakes === 1 ? '' : 's'}`;
    return { text: `🔢 Solved in ${formatClock(elapsedOf(state))} — ${slips}` };
  },
};

export { conflicts, formatClock };
export default game;
