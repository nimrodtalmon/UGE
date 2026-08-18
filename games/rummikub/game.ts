import type { GameDef } from '../../src/shared/plugin.js';
import { buildPool, canAppend, isValidMeld, meldValue, rackValue } from './lib.js';

const RACK_SIZE = 14;

export interface RkPlay {
  melds: number[][]; // new melds laid from the rack
  appends: { meld: number; tile: number }[]; // rack tiles added to table melds
}

export interface RkState {
  racks: number[][];
  pool: number[];
  melds: number[][];
  turn: number;
  melded: boolean[]; // has this seat made the 30-point opening?
  passes: number; // consecutive passes once the pool is empty
  names: string[];
  winner: number | null;
  winText: string | null;
}

export interface RkView {
  rack: number[] | null;
  counts: number[];
  melds: number[][];
  turn: number;
  melded: boolean[];
  poolCount: number;
  names: string[];
  myIndex: number;
  winner: number | null;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function advanceTurn(s: RkState): RkState {
  return { ...s, turn: (s.turn + 1) % s.names.length };
}

function endByPoints(s: RkState): RkState {
  const sums = s.racks.map(rackValue);
  const best = Math.min(...sums);
  const winner = sums.indexOf(best);
  return {
    ...s,
    winner,
    winText: `pool empty & everyone stuck — ${s.names[winner]} wins with the lightest rack (${best})`,
  };
}

const game: GameDef<RkState, RkView> = {
  setup({ players, random }) {
    const pool = shuffle(buildPool(), random);
    return {
      racks: players.map(() => pool.splice(0, RACK_SIZE)),
      pool,
      melds: [],
      turn: 0,
      melded: players.map(() => false),
      passes: 0,
      names: players.map((p) => p.name),
      winner: null,
      winText: null,
    };
  },

  moves: {
    /** Lay a whole turn at once: new melds and/or appends to table melds. */
    play(state, ctx, payload: RkPlay) {
      if (state.winner !== null) return state;
      const me = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (me !== state.turn || !payload || !Array.isArray(payload.melds)) return state;
      const melds = payload.melds;
      const appends = Array.isArray(payload.appends) ? payload.appends : [];

      const used = [...melds.flat(), ...appends.map((a) => a.tile)];
      if (used.length === 0 || new Set(used).size !== used.length) return state;
      const rack = state.racks[me]!;
      if (!used.every((id) => rack.includes(id))) return state;

      if (!state.melded[me]) {
        // the opening must come purely from your own new melds and total 30+
        if (appends.length > 0) return state;
        if (melds.reduce((sum, m) => sum + meldValue(m), 0) < 30) return state;
      }
      if (!melds.every(isValidMeld)) return state;

      const tableMelds = state.melds.map((m) => [...m]);
      for (const a of appends) {
        const target = tableMelds[a.meld];
        if (!target || !canAppend(target, a.tile)) return state;
        target.push(a.tile);
      }

      const racks = state.racks.map((r, i) => (i === me ? r.filter((id) => !used.includes(id)) : r));
      let next: RkState = {
        ...state,
        racks,
        melds: [...tableMelds, ...melds],
        melded: state.melded.map((m, i) => m || i === me),
        passes: 0,
      };
      if (racks[me]!.length === 0) {
        return { ...next, winner: me, winText: `${state.names[me]} is out — Rummikub! 🏆` };
      }
      return advanceTurn(next);
    },

    /**
     * Rearrange the table: submit the complete new table layout. Every tile
     * already on the table must stay on it, every meld must be valid, and at
     * least one tile must come from your rack (no free reshuffles).
     */
    rearrange(state, ctx, payload: { table: number[][] }) {
      if (state.winner !== null) return state;
      const me = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (me !== state.turn || !state.melded[me]) return state;
      if (!payload || !Array.isArray(payload.table)) return state;
      const table = payload.table;
      if (!table.every((m) => Array.isArray(m) && isValidMeld(m))) return state;

      const flat = table.flat();
      const flatSet = new Set(flat);
      if (flatSet.size !== flat.length) return state;
      const oldSet = new Set(state.melds.flat());
      if (![...oldSet].every((id) => flatSet.has(id))) return state; // table tiles never leave the table
      const rack = state.racks[me]!;
      const fromRack = flat.filter((id) => !oldSet.has(id));
      if (fromRack.length === 0) return state; // must play at least one tile
      if (!fromRack.every((id) => rack.includes(id))) return state;

      const racks = state.racks.map((r, i) => (i === me ? r.filter((id) => !flatSet.has(id)) : r));
      const next: RkState = { ...state, racks, melds: table.map((m) => [...m]), passes: 0 };
      if (racks[me]!.length === 0) {
        return { ...next, winner: me, winText: `${state.names[me]} is out — Rummikub! 🏆` };
      }
      return advanceTurn(next);
    },

    /** Draw a tile (or pass when the pool is empty) and end the turn. */
    draw(state, ctx) {
      if (state.winner !== null) return state;
      const me = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (me !== state.turn) return state;
      if (state.pool.length === 0) {
        const passes = state.passes + 1;
        if (passes >= state.names.length) return endByPoints({ ...state, passes });
        return advanceTurn({ ...state, passes });
      }
      const pool = [...state.pool];
      const tile = pool.pop()!;
      const racks = state.racks.map((r, i) => (i === me ? [...r, tile] : r));
      return advanceTurn({ ...state, pool, racks, passes: 0 });
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    return {
      rack: myIndex >= 0 ? state.racks[myIndex]! : null,
      counts: state.racks.map((r) => r.length),
      melds: state.melds,
      turn: state.turn,
      melded: state.melded,
      poolCount: state.pool.length,
      names: state.names,
      myIndex,
      winner: state.winner,
    };
  },

  isOver(state) {
    return state.winner !== null ? { text: state.winText ?? `${state.names[state.winner]} wins!` } : null;
  },
};

export default game;
