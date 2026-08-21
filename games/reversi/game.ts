import type { GameDef } from '../../src/shared/plugin.js';
import { pickPlace } from './bot.js';
import { SIZE, countDiscs, flipsFor, legalMoves, startBoard } from './rules.js';

export { SIZE, countDiscs, flipsFor, legalMoves } from './rules.js';

/** Seat 0 plays black (and moves first), seat 1 plays white. */
export interface RvState {
  size: number;
  /** SIZE*SIZE cells, index = y * SIZE + x. -1 empty, else the seat that owns it. */
  board: number[];
  /** Seat to move — always a seat that HAS a legal move, unless the game is over. */
  current: number;
  names: [string, string];
  /** Cell of the last disc placed. */
  last: number | null;
  /** Cells flipped by that last move (they glow for a beat). */
  flipped: number[];
  /** Seat that had to pass right before this turn, if any. */
  skipped: number | null;
  scores: [number, number];
  overText: string | null;
}

export interface RvView extends RvState {
  /** Seat of the device this view was built for, or -1 (table / spectator). */
  myIndex: number;
  /** Cells the player to move may play — the dots on the board. */
  legal: number[];
}

const game: GameDef<RvState, RvView> = {
  setup({ players }) {
    const board = startBoard();
    return {
      size: SIZE,
      board,
      current: 0,
      names: [players[0]?.name ?? 'Black', players[1]?.name ?? 'White'],
      last: null,
      flipped: [],
      skipped: null,
      scores: countDiscs(board),
      overText: null,
    };
  },

  moves: {
    /** Play a disc at (x, y), flipping every line it outflanks. */
    place(state, ctx, x: number, y: number) {
      if (state.overText) return state;
      if (ctx.role === 'table') return state; // the table is display-only
      if (!Number.isInteger(x) || !Number.isInteger(y)) return state;
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat !== state.current) return state;
      const flips = flipsFor(state.board, x, y, seat);
      if (flips.length === 0) return state; // must outflank at least one disc

      const at = y * SIZE + x;
      const board = [...state.board];
      board[at] = seat;
      for (const i of flips) board[i] = seat;

      const foe = seat === 0 ? 1 : 0;
      const foeCan = legalMoves(board, foe).length > 0;
      const meCan = !foeCan && legalMoves(board, seat).length > 0;
      const scores = countDiscs(board);
      let overText: string | null = null;
      if (!foeCan && !meCan) {
        const [black, white] = scores;
        overText =
          black === white
            ? `Board full — ${black}–${white}, a draw`
            : black > white
              ? `⚫ ${state.names[0]} wins ${black}–${white} 🏆`
              : `⚪ ${state.names[1]} wins ${white}–${black} 🏆`;
      }
      return {
        ...state,
        board,
        current: foeCan ? foe : seat,
        last: at,
        flipped: flips,
        skipped: meCan ? foe : null,
        scores,
        overText,
      };
    },
  },

  playerView(state, { playerId, players }) {
    return {
      ...state,
      myIndex: players.findIndex((p) => p.id === playerId),
      legal: state.overText ? [] : legalMoves(state.board, state.current),
    };
  },

  isOver(state) {
    return state.overText ? { text: state.overText } : null;
  },

  bot(state, { seat, level, random }) {
    if (state.overText || state.current !== seat) return null;
    const spot = pickPlace(state.board, seat, level, random);
    return spot ? { name: 'place', args: [spot.x, spot.y] } : null;
  },
};

export default game;
