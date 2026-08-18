import { Chess } from 'chess.js';
import type { GameDef } from '../../src/shared/plugin.js';

export interface ChessState {
  fen: string;
  lastMove: { from: string; to: string } | null;
  names: [string, string]; // seat 0 = white, seat 1 = black
  shared: boolean;
  overText: string | null;
}

export interface ChessView extends ChessState {
  turn: 'w' | 'b';
  check: boolean;
  myIndex: number;
}

const game: GameDef<ChessState, ChessView> = {
  setup({ players, mode }) {
    const shared = mode.config['shared'] === true;
    return {
      fen: new Chess().fen(),
      lastMove: null,
      names: shared
        ? ['White', 'Black']
        : [players[0]?.name ?? 'White', players[1]?.name ?? 'Black'],
      shared,
      overText: null,
    };
  },

  moves: {
    /** Pawns auto-promote to queens. */
    move(state, ctx, from: string, to: string) {
      if (state.overText || typeof from !== 'string' || typeof to !== 'string') return state;
      const chess = new Chess(state.fen);
      const turn = chess.turn();
      const allowed = state.shared
        ? ctx.role === 'hand'
        : ctx.players[turn === 'w' ? 0 : 1]?.id === ctx.playerId;
      if (!allowed) return state;
      try {
        chess.move({ from, to, promotion: 'q' });
      } catch {
        return state;
      }
      const mover = state.names[turn === 'w' ? 0 : 1];
      let overText: string | null = null;
      if (chess.isCheckmate()) overText = `♛ Checkmate — ${mover} wins! 🏆`;
      else if (chess.isStalemate()) overText = 'Stalemate — it’s a draw';
      else if (chess.isThreefoldRepetition()) overText = 'Draw by repetition';
      else if (chess.isInsufficientMaterial()) overText = 'Draw — insufficient material';
      else if (chess.isDraw()) overText = 'Draw — fifty-move rule';
      return { ...state, fen: chess.fen(), lastMove: { from, to }, overText };
    },

    /** In shared mode the side to move is the one resigning. */
    resign(state, ctx) {
      if (state.overText) return state;
      const turn = new Chess(state.fen).turn();
      let seat: number;
      if (state.shared) {
        if (ctx.role !== 'hand') return state;
        seat = turn === 'w' ? 0 : 1;
      } else {
        seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
        if (seat !== 0 && seat !== 1) return state;
      }
      return {
        ...state,
        overText: `${state.names[seat === 0 ? 1 : 0]} wins — ${state.names[seat]} resigned 🏳️`,
      };
    },
  },

  playerView(state, { playerId, players }) {
    const chess = new Chess(state.fen);
    return {
      ...state,
      turn: chess.turn(),
      check: chess.inCheck(),
      myIndex: players.findIndex((p) => p.id === playerId),
    };
  },

  isOver(state) {
    return state.overText ? { text: state.overText } : null;
  },
};

export default game;
