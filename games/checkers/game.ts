import type { GameDef } from '../../src/shared/plugin.js';
import type { Board, Side, Step } from './rules.js';
import { applyStep, counts, initialBoard, isKing, legalSteps, mustCapture } from './rules.js';
import { pickStep } from './bot.js';

export interface LastMove {
  from: number;
  to: number;
  cap: number | null;
  crowned: boolean;
}

export interface CkState {
  board: Board;
  /** Seat to move: 0 = red (bottom, moves up), 1 = black (top, moves down). */
  turn: Side;
  /** Square of a piece mid multi-jump — only it may move, and only by jumping. */
  chain: number | null;
  names: [string, string];
  lastMove: LastMove | null;
  /** Plies since the last capture or man move — 80 of them is a draw. */
  idle: number;
  overText: string | null;
}

export interface CkView extends CkState {
  myIndex: number;
  /** The side to move has a jump available, so it is forced to take it. */
  mustCapture: boolean;
  /** Pieces left, per seat. */
  left: [number, number];
}

/** Draughts' stale-position rule, in plies (40 moves a side). */
const IDLE_DRAW = 80;

const game: GameDef<CkState, CkView> = {
  setup({ players }) {
    return {
      board: initialBoard(),
      turn: 0,
      chain: null,
      names: [players[0]?.name ?? 'Red', players[1]?.name ?? 'Black'],
      lastMove: null,
      idle: 0,
      overText: null,
    };
  },

  moves: {
    /** Move the piece on `from` to `to` — both plain square indexes, 0..63. */
    step(state, ctx, from: number, to: number) {
      if (state.overText) return state;
      if (typeof from !== 'number' || typeof to !== 'number') return state;
      if (!Number.isInteger(from) || !Number.isInteger(to)) return state;
      if (from < 0 || from > 63 || to < 0 || to > 63) return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat !== state.turn) return state;

      const pos = { board: state.board, turn: state.turn, chain: state.chain };
      const chosen: Step | undefined = legalSteps(pos).find((s) => s.from === from && s.to === to);
      if (!chosen) return state;

      const wasMan = !isKing(state.board[from] ?? '');
      const next = applyStep(pos, chosen);
      const idle = chosen.cap !== null || wasMan ? 0 : state.idle + 1;
      const left = counts(next.board);

      let overText: string | null = null;
      if (next.chain === null) {
        // The turn has passed: whoever is on move now may have nothing left.
        const stuck = legalSteps({ board: next.board, turn: next.turn, chain: null }).length === 0;
        if (stuck) {
          const winner = (1 - next.turn) as Side;
          const badge = winner === 0 ? '🔴' : '⚫';
          overText =
            left[next.turn] === 0
              ? `${badge} ${state.names[winner]} wins — every piece captured! 🏆`
              : `${badge} ${state.names[winner]} wins — ${state.names[next.turn]} is stuck! 🏆`;
        }
      }
      if (!overText && idle >= IDLE_DRAW) overText = 'Draw — 40 moves with no capture';

      return {
        ...state,
        board: next.board,
        turn: next.turn,
        chain: next.chain,
        idle,
        lastMove: { from, to, cap: chosen.cap, crowned: next.crowned },
        overText,
      };
    },

    resign(state, ctx) {
      if (state.overText) return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat !== 0 && seat !== 1) return state;
      return {
        ...state,
        overText: `${state.names[seat === 0 ? 1 : 0]} wins — ${state.names[seat]} resigned 🏳️`,
      };
    },
  },

  /** Nothing is hidden in checkers — the view only adds what the screen needs. */
  playerView(state, { playerId, players }) {
    return {
      ...state,
      myIndex: players.findIndex((p) => p.id === playerId),
      mustCapture: mustCapture({ board: state.board, turn: state.turn, chain: state.chain }),
      left: counts(state.board),
    };
  },

  isOver(state) {
    return state.overText ? { text: state.overText } : null;
  },

  bot(state, { seat, level, random }) {
    if (state.overText || state.turn !== seat) return null;
    const step = pickStep({ board: state.board, turn: state.turn, chain: state.chain }, level, random);
    return step ? { name: 'step', args: [step.from, step.to] } : null;
  },
};

export default game;
