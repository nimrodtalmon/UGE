import type { GameDef } from '../../src/shared/plugin.js';

/**
 * Solo Minesweeper. Modern first-tap rule: the field is laid on the first
 * reveal, never under that cell nor its eight neighbours, so the opening tap
 * is always safe and always opens an area.
 *
 * The mine field is the whole game, so it never leaves the server: playerView
 * ships revealed cells (with their counts), flags and covered markers only,
 * and the bombs are added to the wire exactly once the game is over.
 */

export type MsStatus = 'playing' | 'won' | 'lost';

export interface MsState {
  w: number;
  h: number;
  mines: number;
  /** Laid on the first reveal — null means "not seeded yet". */
  bombs: boolean[] | null;
  /** Neighbour mine counts; null while bombs is null. */
  counts: number[] | null;
  revealed: boolean[];
  flags: boolean[];
  status: MsStatus;
  /** Server clock (ms) at the first reveal / at the end; null before. */
  startedAt: number | null;
  endedAt: number | null;
  /** The mine that was stepped on. */
  boom: number | null;
}

/** One cell as a client may see it. */
export interface MsCell {
  revealed: boolean;
  /** Neighbour mines — 0 unless this cell is revealed, so counts never leak. */
  count: number;
  flag: boolean;
  /** Always false while the game is running. */
  mine: boolean;
}

export interface MsView {
  w: number;
  h: number;
  /** Mines on the board (public from the start — it is the difficulty). */
  mines: number;
  /** Flags planted, for the mines-remaining counter. */
  flags: number;
  cells: MsCell[];
  status: MsStatus;
  startedAt: number | null;
  endedAt: number | null;
  boom: number | null;
}

const MAX_SIDE = 40;

/** MM:SS, used by isOver and by the views' timer. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Mode config is opaque JSON from the lobby — treat every field as hostile. */
function dimension(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = config[key];
  return typeof v === 'number' && Number.isInteger(v) && v >= 2 && v <= MAX_SIDE ? v : fallback;
}

function neighbours(w: number, h: number, i: number): number[] {
  const x = i % w;
  const y = Math.floor(i / w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx);
    }
  }
  return out;
}

function fresh(w: number, h: number, mines: number): MsState {
  return {
    w,
    h,
    mines,
    bombs: null,
    counts: null,
    revealed: Array<boolean>(w * h).fill(false),
    flags: Array<boolean>(w * h).fill(false),
    status: 'playing',
    startedAt: null,
    endedAt: null,
    boom: null,
  };
}

/** Lay the field around a guaranteed-safe opening cell (plus its neighbours). */
function lay(
  w: number,
  h: number,
  mines: number,
  safe: number,
  random: () => number,
): { bombs: boolean[]; counts: number[] } {
  const banned = new Set<number>([safe, ...neighbours(w, h, safe)]);
  let pool: number[] = [];
  for (let i = 0; i < w * h; i++) if (!banned.has(i)) pool.push(i);
  // a very dense board may not leave room for the whole safe patch: then only
  // the tapped cell itself is protected
  if (pool.length < mines) {
    pool = [];
    for (let i = 0; i < w * h; i++) if (i !== safe) pool.push(i);
  }
  const take = Math.min(mines, pool.length);
  for (let k = 0; k < take; k++) {
    const j = k + Math.floor(random() * (pool.length - k));
    const swap = pool[k]!;
    pool[k] = pool[j]!;
    pool[j] = swap;
  }
  const bombs = Array<boolean>(w * h).fill(false);
  for (let k = 0; k < take; k++) bombs[pool[k]!] = true;
  const counts = bombs.map((_, i) => neighbours(w, h, i).filter((n) => bombs[n]).length);
  return { bombs, counts };
}

/**
 * Iterative flood fill from the given seeds (no recursion — a zero region can
 * span the whole board). Mutates `revealed`; returns the mine that was hit.
 */
function sweep(
  w: number,
  h: number,
  bombs: boolean[],
  counts: number[],
  flags: boolean[],
  revealed: boolean[],
  seeds: number[],
): number | null {
  const stack = [...seeds];
  let boom: number | null = null;
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (revealed[i] || flags[i]) continue; // flags stop the flood, as they should
    revealed[i] = true;
    if (bombs[i]) {
      boom ??= i;
      continue;
    }
    if (counts[i] === 0) {
      for (const n of neighbours(w, h, i)) if (!revealed[n] && !flags[n]) stack.push(n);
    }
  }
  return boom;
}

/** Reveal from `seeds`, then settle the outcome (boom / swept / still playing). */
function apply(
  state: MsState,
  bombs: boolean[],
  counts: number[],
  startedAt: number,
  seeds: number[],
  now: number,
): MsState {
  const revealed = [...state.revealed];
  const boom = sweep(state.w, state.h, bombs, counts, state.flags, revealed, seeds);
  const next: MsState = { ...state, bombs, counts, revealed, startedAt };

  if (boom !== null) {
    for (let i = 0; i < bombs.length; i++) if (bombs[i]) revealed[i] = true;
    return { ...next, status: 'lost', endedAt: now, boom };
  }
  const swept = bombs.every((mine, i) => mine || revealed[i]);
  // winning plants the last flags for you, so the counter lands on zero
  return swept ? { ...next, status: 'won', endedAt: now, flags: [...bombs] } : next;
}

/** Validate client coordinates; returns the cell index or null. */
function cellIndex(state: MsState, x: unknown, y: unknown): number | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < 0 || x >= state.w || y < 0 || y >= state.h) return null;
  return y * state.w + x;
}

const elapsedOf = (state: MsState): number =>
  state.startedAt === null ? 0 : (state.endedAt ?? state.startedAt) - state.startedAt;

const game: GameDef<MsState, MsView> = {
  setup({ mode }) {
    const w = dimension(mode.config, 'w', 9);
    const h = dimension(mode.config, 'h', 9);
    const raw = mode.config['mines'];
    const wanted = typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : 10;
    return fresh(w, h, Math.min(wanted, w * h - 1)); // always one safe cell
  },

  moves: {
    reveal(state, ctx, x: number, y: number) {
      if (ctx.role === 'table') return state; // the table is display-only
      if (state.status !== 'playing') return state;
      const i = cellIndex(state, x, y);
      if (i === null || state.flags[i] || state.revealed[i]) return state;
      if (!state.bombs || !state.counts) {
        const { bombs, counts } = lay(state.w, state.h, state.mines, i, ctx.random);
        return apply(state, bombs, counts, ctx.now, [i], ctx.now);
      }
      return apply(state, state.bombs, state.counts, state.startedAt ?? ctx.now, [i], ctx.now);
    },

    flag(state, ctx, x: number, y: number) {
      if (ctx.role === 'table') return state;
      if (state.status !== 'playing') return state;
      const i = cellIndex(state, x, y);
      if (i === null || state.revealed[i]) return state;
      const flags = [...state.flags];
      flags[i] = !flags[i];
      return { ...state, flags };
    },

    /** Classic chord: a revealed number with exactly its many flags around it. */
    chord(state, ctx, x: number, y: number) {
      if (ctx.role === 'table') return state;
      if (state.status !== 'playing') return state;
      const { bombs, counts } = state;
      if (!bombs || !counts) return state;
      const i = cellIndex(state, x, y);
      if (i === null || !state.revealed[i]) return state;
      const count = counts[i] ?? 0;
      if (count === 0) return state;
      const around = neighbours(state.w, state.h, i);
      if (around.filter((n) => state.flags[n]).length !== count) return state;
      const seeds = around.filter((n) => !state.flags[n] && !state.revealed[n]);
      if (seeds.length === 0) return state;
      // a misplaced flag means one of these is a mine — losing here is correct
      return apply(state, bombs, counts, state.startedAt ?? ctx.now, seeds, ctx.now);
    },

    /** Same size and mine count, fresh layout on the next first tap. */
    restart(state, ctx) {
      if (ctx.role === 'table') return state;
      return fresh(state.w, state.h, state.mines);
    },
  },

  playerView(state) {
    const over = state.status !== 'playing';
    const bombs = state.bombs;
    const counts = state.counts;
    const cells: MsCell[] = state.revealed.map((revealed, i) => ({
      revealed,
      count: revealed ? (counts?.[i] ?? 0) : 0,
      flag: state.flags[i] === true,
      mine: over && bombs !== null && bombs[i] === true,
    }));
    return {
      w: state.w,
      h: state.h,
      mines: state.mines,
      flags: state.flags.filter(Boolean).length,
      cells,
      status: state.status,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      boom: over ? state.boom : null,
    };
  },

  isOver(state) {
    if (state.status === 'won') {
      return { text: `💣 Swept! ${state.mines} mines in ${formatClock(elapsedOf(state))}` };
    }
    if (state.status === 'lost') {
      return { text: `💥 Boom — hit a mine after ${formatClock(elapsedOf(state))}` };
    }
    return null;
  },
};

export default game;
