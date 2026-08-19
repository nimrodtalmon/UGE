import { Chess } from 'chess.js';
import type { GameDef } from '../../src/shared/plugin.js';

export interface ChessState {
  fen: string;
  lastMove: { from: string; to: string } | null;
  names: [string, string]; // seat 0 = white, seat 1 = black
  shared: boolean;
  overText: string | null;
  /** Position occurrence counts for threefold repetition (state is FEN-only,
   *  so chess.js's own history-based detection can never fire). */
  positions: Record<string, number>;
}

export interface ChessView extends Omit<ChessState, 'positions'> {
  turn: 'w' | 'b';
  check: boolean;
  myIndex: number;
}

/** Repetition key: placement, side to move, castling rights, en passant. */
const positionKey = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

const game: GameDef<ChessState, ChessView> = {
  setup({ players, mode }) {
    const shared = mode.config['shared'] === true;
    const fen = new Chess().fen();
    return {
      fen,
      lastMove: null,
      names: shared
        ? ['White', 'Black']
        : [players[0]?.name ?? 'White', players[1]?.name ?? 'Black'],
      shared,
      overText: null,
      positions: { [positionKey(fen)]: 1 },
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
      const fen = chess.fen();
      const key = positionKey(fen);
      const seen = (state.positions[key] ?? 0) + 1;
      let overText: string | null = null;
      if (chess.isCheckmate()) overText = `♛ Checkmate — ${mover} wins! 🏆`;
      else if (chess.isStalemate()) overText = 'Stalemate — it’s a draw';
      else if (seen >= 3) overText = 'Draw by repetition';
      else if (chess.isInsufficientMaterial()) overText = 'Draw — insufficient material';
      else if (chess.isDraw()) overText = 'Draw — fifty-move rule';
      return {
        ...state,
        fen,
        lastMove: { from, to },
        overText,
        positions: { ...state.positions, [key]: seen },
      };
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
    const { positions: _positions, ...visible } = state;
    return {
      ...visible,
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
