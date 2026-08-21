import type { GameDef } from '../../src/shared/plugin.js';
import { pickEdge } from './bot.js';
import { boxCount, dotsFromConfig, drawEdge, edgeCount } from './rules.js';

/**
 * Dots & Boxes. Nothing is hidden — every line is on the board — so the view
 * is the state plus which seat is asking.
 *
 * Seat 0 moves first. Closing a box scores it AND gives another turn, which
 * is the whole game: the long chains at the end go to whoever can keep
 * handing the turn back.
 */

export interface DbState {
  /** Dots per side; boxes are (n-1)². */
  n: number;
  /** Edge drawn or not, indexed as in rules.ts. */
  taken: boolean[];
  /** Seat that drew each edge, -1 while undrawn. */
  drawnBy: number[];
  /** Seat owning each box, -1 while open. */
  boxes: number[];
  turn: number;
  names: [string, string];
  scores: [number, number];
  /** The edge drawn last, so the views can flash it. */
  last: number | null;
  /** Boxes closed by that move — they get the glow. */
  justClosed: number[];
  /** The mover closed a box and is still on. */
  again: boolean;
  overText: string | null;
}

export interface DbView extends DbState {
  /** Seat of the device this view was built for, or -1 (table / spectator). */
  myIndex: number;
}

const game: GameDef<DbState, DbView> = {
  setup({ players, mode }) {
    const n = dotsFromConfig(mode.config, 5);
    return {
      n,
      taken: new Array<boolean>(edgeCount(n)).fill(false),
      drawnBy: new Array<number>(edgeCount(n)).fill(-1),
      boxes: new Array<number>(boxCount(n)).fill(-1),
      turn: 0,
      names: [players[0]?.name ?? 'Player 1', players[1]?.name ?? 'Player 2'],
      scores: [0, 0],
      last: null,
      justClosed: [],
      again: false,
      overText: null,
    };
  },

  moves: {
    /** Draw one line between two neighbouring dots. */
    draw(state, ctx, edge: number) {
      if (state.overText) return state;
      if (ctx.role === 'table') return state; // the table is display-only
      if (typeof edge !== 'number' || !Number.isInteger(edge)) return state;
      if (edge < 0 || edge >= state.taken.length) return state;
      if (state.taken[edge] === true) return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat !== state.turn) return state;

      const step = drawEdge(state.n, state.taken, edge);
      const drawnBy = [...state.drawnBy];
      drawnBy[edge] = seat;
      const boxes = [...state.boxes];
      for (const b of step.closed) boxes[b] = seat;
      const scores: [number, number] = [state.scores[0], state.scores[1]];
      scores[seat === 0 ? 0 : 1] += step.closed.length;
      const again = step.closed.length > 0;

      const full = step.taken.every((t) => t);
      const overText = !full
        ? null
        : scores[0] === scores[1]
          ? `Honours even — ${scores[0]} boxes each 🤝`
          : scores[0] > scores[1]
            ? `▢ ${state.names[0]} wins ${scores[0]}–${scores[1]}! 🏆`
            : `▢ ${state.names[1]} wins ${scores[1]}–${scores[0]}! 🏆`;

      return {
        ...state,
        taken: step.taken,
        drawnBy,
        boxes,
        scores,
        turn: again ? seat : seat === 0 ? 1 : 0,
        last: edge,
        justClosed: step.closed,
        again: again && !full,
        overText,
      };
    },
  },

  /** Nothing to hide — the board is the whole story. */
  playerView(state, { playerId, players }) {
    return { ...state, myIndex: players.findIndex((p) => p.id === playerId) };
  },

  isOver(state) {
    return state.overText ? { text: state.overText } : null;
  },

  bot(state, { seat, level, random }) {
    if (state.overText || state.turn !== seat) return null;
    const edge = pickEdge(state.n, state.taken, level, random);
    return edge === null ? null : { name: 'draw', args: [edge] };
  },
};

export default game;
