import type { GameDef } from '../../src/shared/plugin.js';
import type { Side } from './rules.js';
import { initialPits, isPitOf, sow, storeOf } from './rules.js';
import { pickPit } from './bot.js';

export interface LastSow {
  by: Side;
  pit: number;
  /** Pits that got a seed, in sowing order — the view lights these up. */
  path: number[];
  land: number;
  captured: number;
  again: boolean;
}

export interface MnState {
  /** 0..5 seat 0's pits, 6 its store; 7..12 seat 1's pits, 13 its store. */
  pits: number[];
  turn: Side;
  names: [string, string];
  /** The side to move is here because its last seed landed in its own store. */
  again: boolean;
  last: LastSow | null;
  overText: string | null;
}

export interface MnView extends MnState {
  myIndex: number;
}

const game: GameDef<MnState, MnView> = {
  setup({ players }) {
    return {
      pits: initialPits(),
      turn: 0,
      names: [players[0]?.name ?? 'Player 1', players[1]?.name ?? 'Player 2'],
      again: false,
      last: null,
      overText: null,
    };
  },

  moves: {
    /** Pick up everything in one of your pits and sow it anticlockwise. */
    sow(state, ctx, pit: number) {
      if (state.overText) return state;
      if (typeof pit !== 'number' || !Number.isInteger(pit)) return state;
      if (pit < 0 || pit > 13) return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat !== state.turn) return state;
      if (!isPitOf(pit, state.turn)) return state;
      if ((state.pits[pit] ?? 0) <= 0) return state;

      const mover = state.turn;
      const result = sow(state.pits, mover, pit);

      let overText: string | null = null;
      if (result.finished) {
        const a = result.pits[storeOf(0)] ?? 0;
        const b = result.pits[storeOf(1)] ?? 0;
        overText =
          a === b
            ? `Dead heat — ${a} seeds each 🤝`
            : a > b
              ? `🫘 ${state.names[0]} wins, ${a}–${b}! 🏆`
              : `🫘 ${state.names[1]} wins, ${b}–${a}! 🏆`;
      }

      return {
        ...state,
        pits: result.pits,
        turn: result.turn,
        again: result.again && !result.finished,
        last: {
          by: mover,
          pit,
          path: result.path,
          land: result.land,
          captured: result.captured,
          again: result.again,
        },
        overText,
      };
    },
  },

  /** Nothing is hidden in Mancala — every seed is on the table. */
  playerView(state, { playerId, players }) {
    return { ...state, myIndex: players.findIndex((p) => p.id === playerId) };
  },

  isOver(state) {
    return state.overText ? { text: state.overText } : null;
  },

  bot(state, { seat, level, random }) {
    if (state.overText || state.turn !== seat) return null;
    const pit = pickPit(state.pits, state.turn, level, random);
    return pit === null ? null : { name: 'sow', args: [pit] };
  },
};

export default game;
