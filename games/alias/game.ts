import type { GameDef } from '../../src/shared/plugin.js';
import wordsJson from './assets/words.en.json' with { type: 'json' };

const WORDS = wordsJson as string[];
const ROUND_MS = 45_000;

export interface AliasState {
  phase: 'ready' | 'round' | 'done';
  words: string[];
  ptr: number;
  turn: number; // seat index of the current explainer
  roundsPlayed: number;
  endsAt: number;
  scores: number[];
  skips: number[];
  playerNames: string[];
  playerIds: string[];
}

/** Clients never receive the full word list — just the explainer's current word. */
export interface AliasView {
  phase: 'ready' | 'round' | 'done';
  word: string | null; // only for the current explainer, only during a round
  turn: number;
  myIndex: number;
  endsAt: number;
  roundMs: number;
  scores: number[];
  skips: number[];
  playerNames: string[];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function isExplainer(state: AliasState, playerId: string): boolean {
  return state.playerIds[state.turn] === playerId;
}

const game: GameDef<AliasState, AliasView> = {
  setup({ players, random }) {
    return {
      phase: 'ready',
      words: shuffle(WORDS, random),
      ptr: 0,
      turn: 0,
      roundsPlayed: 0,
      endsAt: 0,
      scores: players.map(() => 0),
      skips: players.map(() => 0),
      playerNames: players.map((p) => p.name),
      playerIds: players.map((p) => p.id),
    };
  },

  moves: {
    /** Only the explainer starts their own round, from their phone. */
    startRound(state, ctx) {
      if (state.phase !== 'ready' || !isExplainer(state, ctx.playerId)) return state;
      return { ...state, phase: 'round', endsAt: ctx.now + ROUND_MS };
    },

    gotIt(state, ctx) {
      if (state.phase !== 'round' || !isExplainer(state, ctx.playerId)) return state;
      const scores = [...state.scores];
      scores[state.turn] = (scores[state.turn] ?? 0) + 1;
      return { ...state, scores, ptr: state.ptr + 1 };
    },

    skip(state, ctx) {
      if (state.phase !== 'round' || !isExplainer(state, ctx.playerId)) return state;
      const skips = [...state.skips];
      skips[state.turn] = (skips[state.turn] ?? 0) + 1;
      return { ...state, skips, ptr: state.ptr + 1 };
    },

    /** Round timer ran out (sent by the table on a timer; idempotent). */
    endRound(state, ctx) {
      if (state.phase !== 'round' || ctx.now < state.endsAt - 250) return state;
      const roundsPlayed = state.roundsPlayed + 1;
      if (roundsPlayed >= state.playerNames.length) {
        return { ...state, phase: 'done', roundsPlayed };
      }
      return {
        ...state,
        phase: 'ready',
        roundsPlayed,
        turn: (state.turn + 1) % state.playerNames.length,
      };
    },
  },

  playerView(state, { playerId }) {
    const myIndex = state.playerIds.findIndex((id) => id === playerId);
    const explaining = state.phase === 'round' && playerId !== null && isExplainer(state, playerId);
    return {
      phase: state.phase,
      word: explaining ? (state.words[state.ptr % state.words.length] ?? null) : null,
      turn: state.turn,
      myIndex,
      endsAt: state.endsAt,
      roundMs: ROUND_MS,
      scores: state.scores,
      skips: state.skips,
      playerNames: state.playerNames,
    };
  },

  isOver(state) {
    if (state.phase !== 'done') return null;
    const top = Math.max(...state.scores);
    const winners = state.playerNames.filter((_, i) => state.scores[i] === top);
    return winners.length === 1
      ? { text: `${winners[0]} wins with ${top} words! 🏆` }
      : { text: `Tie — ${winners.join(' & ')} (${top} words)` };
  },
};

export default game;
