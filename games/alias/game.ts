import type { GameDef } from '../../src/shared/plugin.js';
import wordsJson from './assets/words.en.json' with { type: 'json' };

const WORDS = wordsJson as string[];
const ROUND_MS = 45_000;

export interface AliasState {
  phase: 'ready' | 'round' | 'done';
  words: string[];
  ptr: number;
  turn: number; // seat index of the explainer — or the round index in pass mode
  roundsPlayed: number;
  endsAt: number;
  scores: number[]; // per player — or per round in pass mode
  skips: number[];
  playerNames: string[];
  playerIds: string[];
  /** "Pass the phone" mode: one shared device, anyone holding it explains. */
  pass: boolean;
  totalRounds: number;
}

/** Clients never receive the full word list — just the explainer's current word. */
export interface AliasView {
  phase: 'ready' | 'round' | 'done';
  word: string | null;
  turn: number;
  myIndex: number;
  endsAt: number;
  roundMs: number;
  scores: number[];
  skips: number[];
  playerNames: string[];
  pass: boolean;
  totalRounds: number;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function canExplain(state: AliasState, ctx: { playerId: string; role: string }): boolean {
  return state.pass ? ctx.role === 'hand' : state.playerIds[state.turn] === ctx.playerId;
}

const game: GameDef<AliasState, AliasView> = {
  setup({ players, random, mode, group }) {
    const pass = mode.config['pass'] === true;
    const totalRounds = pass
      ? Math.max(2, Math.min(12, group?.players ?? 4))
      : players.length;
    return {
      phase: 'ready',
      words: shuffle(WORDS, random),
      ptr: 0,
      turn: 0,
      roundsPlayed: 0,
      endsAt: 0,
      scores: Array<number>(totalRounds).fill(0),
      skips: Array<number>(totalRounds).fill(0),
      playerNames: players.map((p) => p.name),
      playerIds: players.map((p) => p.id),
      pass,
      totalRounds,
    };
  },

  moves: {
    startRound(state, ctx) {
      if (state.phase !== 'ready' || !canExplain(state, ctx)) return state;
      return { ...state, phase: 'round', endsAt: ctx.now + ROUND_MS };
    },

    gotIt(state, ctx) {
      if (state.phase !== 'round' || !canExplain(state, ctx)) return state;
      const scores = [...state.scores];
      scores[state.turn] = (scores[state.turn] ?? 0) + 1;
      return { ...state, scores, ptr: state.ptr + 1 };
    },

    skip(state, ctx) {
      if (state.phase !== 'round' || !canExplain(state, ctx)) return state;
      const skips = [...state.skips];
      skips[state.turn] = (skips[state.turn] ?? 0) + 1;
      return { ...state, skips, ptr: state.ptr + 1 };
    },

    /** Round timer ran out (sent on a client timer; idempotent). */
    endRound(state, ctx) {
      if (state.phase !== 'round' || ctx.now < state.endsAt - 250) return state;
      const roundsPlayed = state.roundsPlayed + 1;
      if (roundsPlayed >= state.totalRounds) {
        return { ...state, phase: 'done', roundsPlayed };
      }
      return { ...state, phase: 'ready', roundsPlayed, turn: (state.turn + 1) % state.totalRounds };
    },
  },

  playerView(state, { playerId, role }) {
    const myIndex = state.playerIds.findIndex((id) => id === playerId);
    const explaining =
      state.phase === 'round' &&
      (state.pass ? role === 'hand' : playerId !== null && state.playerIds[state.turn] === playerId);
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
      pass: state.pass,
      totalRounds: state.totalRounds,
    };
  },

  isOver(state) {
    if (state.phase !== 'done') return null;
    if (state.pass) {
      const total = state.scores.reduce((a, b) => a + b, 0);
      return { text: `Together you got ${total} words in ${state.totalRounds} rounds! 🎉` };
    }
    const top = Math.max(...state.scores);
    const winners = state.playerNames.filter((_, i) => state.scores[i] === top);
    return winners.length === 1
      ? { text: `${winners[0]} wins with ${top} words! 🏆` }
      : { text: `Tie — ${winners.join(' & ')} (${top} words)` };
  },
};

export default game;
