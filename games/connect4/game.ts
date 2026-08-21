import type { GameDef } from '../../src/shared/plugin.js';
import { pickColumn } from './bot.js';
import { COLS, ROWS, landingRow, openColumns, winningLine } from './rules.js';

export { COLS, ROWS, landingRow, winningLine } from './rules.js';

/** Seat 0 drops red, seat 1 drops yellow. */
export interface C4State {
  cols: number;
  rows: number;
  /** cols*rows cells, index = y * cols + x, y = 0 is the TOP row. -1 empty, else the seat. */
  board: number[];
  /** Seat to move. */
  current: number;
  names: [string, string];
  /** Cell index of the last disc dropped, for the drop animation. */
  last: number | null;
  /** The four cells that won it, once someone has. */
  win: number[] | null;
  winner: number | null;
  draw: boolean;
}

export interface C4View extends C4State {
  /** Seat of the device this view was built for, or -1 (table / spectator). */
  myIndex: number;
  /** Columns that still have room. */
  open: number[];
}

const game: GameDef<C4State, C4View> = {
  setup({ players }) {
    return {
      cols: COLS,
      rows: ROWS,
      board: Array(COLS * ROWS).fill(-1),
      current: 0,
      names: [players[0]?.name ?? 'Red', players[1]?.name ?? 'Yellow'],
      last: null,
      win: null,
      winner: null,
      draw: false,
    };
  },

  moves: {
    /** Drop a disc into a column; it falls to the lowest empty cell. */
    drop(state, ctx, col: number) {
      if (state.winner !== null || state.draw) return state;
      if (ctx.role === 'table') return state; // the table is display-only
      if (!Number.isInteger(col) || col < 0 || col >= COLS) return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat !== state.current) return state;
      const y = landingRow(state.board, col);
      if (y < 0) return state; // column full
      const at = y * COLS + col;
      const board = [...state.board];
      board[at] = seat;
      const win = winningLine(board, at);
      const full = board.every((c) => c >= 0);
      return {
        ...state,
        board,
        last: at,
        current: win || full ? state.current : seat === 0 ? 1 : 0,
        win,
        winner: win ? seat : null,
        draw: !win && full,
      };
    },
  },

  playerView(state, { playerId, players }) {
    return {
      ...state,
      myIndex: players.findIndex((p) => p.id === playerId),
      open: openColumns(state.board),
    };
  },

  isOver(state) {
    if (state.winner !== null) {
      const disc = state.winner === 0 ? '🔴' : '🟡';
      return { text: `${disc} ${state.names[state.winner === 0 ? 0 : 1]} wins — four in a row! 🏆` };
    }
    return state.draw ? { text: 'Board full — a draw' } : null;
  },

  bot(state, { seat, level, random }) {
    if (state.winner !== null || state.draw) return null;
    if (state.current !== seat) return null;
    const col = pickColumn(state.board, seat, level, random);
    return col === null ? null : { name: 'drop', args: [col] };
  },
};

export default game;
