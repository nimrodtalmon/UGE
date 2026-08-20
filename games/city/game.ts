import type { GameDef } from '../../src/shared/plugin.js';
import {
  advance,
  analyze,
  at,
  booksOf,
  BULLDOZE_COST,
  COST,
  freshCity,
  H,
  isBuildKind,
  W,
} from './lib.js';
import type { CityState, CityView } from './lib.js';

/**
 * Tiny City — a solo builder on a 10×10 plot.
 *
 * The city only ever moves on `nextYear`, because the platform syncs by
 * polling: no ticking clock, no real-time loop, just a turn the player takes
 * when the map looks right. Everything derived (connectivity, power, density,
 * the books) is recomputed from the tiles, so the stored state is small and
 * can never disagree with the map.
 *
 * Solo game: nothing is hidden, so `playerView` passes the state through and
 * adds the derived numbers the views would otherwise have to recompute.
 */

export type { CityState, CityView } from './lib.js';

/** Mode config is opaque JSON from the lobby — treat every field as hostile. */
function readConfig(config: Record<string, unknown>): {
  sandbox: boolean;
  goal: number;
  years: number;
} {
  const sandbox = config['sandbox'] === true;
  const rawGoal = config['goal'];
  const rawYears = config['years'];
  const goal =
    typeof rawGoal === 'number' && Number.isInteger(rawGoal) && rawGoal >= 1 && rawGoal <= 1_000_000
      ? rawGoal
      : 2000;
  const years =
    typeof rawYears === 'number' && Number.isInteger(rawYears) && rawYears >= 1 && rawYears <= 500
      ? rawYears
      : 20;
  return { sandbox, goal, years };
}

/** Validate client coordinates; returns the tile index or null. */
function tileIndex(state: CityState, x: unknown, y: unknown): number | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < 0 || x >= W || y < 0 || y >= H) return null;
  return y * W + x;
}

const game: GameDef<CityState, CityView> = {
  setup({ mode, random }) {
    return freshCity(random, readConfig(mode.config));
  },

  moves: {
    /** Place a building on empty land, if the treasury can take it. */
    build(state, ctx, x: number, y: number, kind: string) {
      if (ctx.role === 'table') return state; // the table is display-only
      if (state.status !== 'playing') return state;
      if (typeof kind !== 'string' || !isBuildKind(kind)) return state;
      const i = tileIndex(state, x, y);
      if (i === null) return state;
      if (at(state.tiles, i) !== 'empty') return state; // water and built tiles are taken
      const cost = COST[kind];
      if (state.money < cost) return state;
      const tiles = [...state.tiles];
      tiles[i] = kind;
      return { ...state, tiles, money: state.money - cost };
    },

    /** Clear a tile back to land. Water is scenery, not a mistake to undo. */
    bulldoze(state, ctx, x: number, y: number) {
      if (ctx.role === 'table') return state;
      if (state.status !== 'playing') return state;
      const i = tileIndex(state, x, y);
      if (i === null) return state;
      const kind = at(state.tiles, i);
      if (kind === 'empty' || kind === 'water') return state;
      if (state.money < BULLDOZE_COST) return state;
      const tiles = [...state.tiles];
      tiles[i] = 'empty';
      return { ...state, tiles, money: state.money - BULLDOZE_COST };
    },

    /** The only clock in the game: one press, one simulated year. */
    nextYear(state, ctx) {
      if (ctx.role === 'table') return state;
      if (state.status !== 'playing') return state;
      return advance(state, ctx.random);
    },

    /** Same mode, new lake. */
    restart(state, ctx) {
      if (ctx.role === 'table') return state;
      return freshCity(ctx.random, {
        sandbox: state.sandbox,
        goal: state.sandbox ? 2000 : state.goal,
        years: state.sandbox ? 20 : state.years,
      });
    },
  },

  playerView(state) {
    const a = analyze(state.tiles);
    return {
      ...state,
      warn: a.warn,
      level: a.level,
      stats: a.stats,
      books: booksOf(state.population, a),
    };
  },

  isOver(state) {
    if (state.sandbox) return null; // sandbox has no fail state and no finish line
    const year = state.endedYear ?? state.year;
    if (state.status === 'won') {
      return { text: `🏙️ Mayor of the year — ${state.population} people by year ${year}!` };
    }
    if (state.status === 'lost') {
      const how = state.lostReason === 'bankrupt' ? `Bankrupt in year ${year}` : 'Term over';
      return { text: `🏙️ ${how} — ${state.population} people, short of ${state.goal}` };
    }
    return null;
  },
};

export default game;
