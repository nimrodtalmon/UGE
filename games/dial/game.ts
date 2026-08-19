import type { GameDef } from '../../src/shared/plugin.js';
import spectrumsJson from './assets/spectrums.en.json' with { type: 'json' };

export interface Spectrum {
  left: string;
  right: string;
}

const SPECTRUMS = spectrumsJson as Spectrum[];
const REVEAL_MS = 8_000;

export interface DialState {
  phase: 'ready' | 'clue' | 'guess' | 'reveal' | 'done';
  round: number; // 0-based; even rounds are 🔴, odd are 🔵
  totalRounds: number;
  scores: number[]; // [red, blue]
  order: number[]; // shuffled spectrum indices — no repeats across the game
  spectrum: Spectrum | null;
  target: number; // 3..97 — secret until reveal (see playerView)
  dial: number; // 0..100 — the shared needle during 'guess'
  guess: number; // where the team locked it in
  lastPoints: number; // points the last reveal awarded
  endsAt: number; // reveal auto-advance deadline
  /** Device that claimed the psychic seat this round (explainerId pattern). */
  psychicId: string | null;
  psychicName: string | null;
}

/** The target reaches only the psychic's device — and everyone at reveal. */
export interface DialView {
  phase: DialState['phase'];
  round: number;
  totalRounds: number;
  scores: number[];
  spectrum: Spectrum | null;
  target: number | null;
  dial: number;
  guess: number;
  lastPoints: number;
  endsAt: number;
  revealMs: number;
  iAmPsychic: boolean;
  psychicName: string | null;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Closeness → points: within 5 → 4, within 12 → 3, within 25 → 2, else 0. */
export function pointsFor(diff: number): number {
  if (diff <= 5) return 4;
  if (diff <= 12) return 3;
  if (diff <= 25) return 2;
  return 0;
}

const game: GameDef<DialState, DialView> = {
  setup({ random, group }) {
    // even round count so both teams play the psychic equally often
    const totalRounds = Math.min(12, Math.max(4, 2 * Math.floor((group?.players ?? 4) / 2)));
    return {
      phase: 'ready',
      round: 0,
      totalRounds,
      scores: [0, 0],
      order: shuffle(
        SPECTRUMS.map((_, i) => i),
        random,
      ),
      spectrum: null,
      target: 0,
      dial: 50,
      guess: 50,
      lastPoints: 0,
      endsAt: 0,
      psychicId: null,
      psychicName: null,
    };
  },

  moves: {
    /** Any hand device claims the psychic seat and draws a fresh spectrum. */
    startRound(state, ctx) {
      if (state.phase !== 'ready' || ctx.role !== 'hand') return state;
      const spectrum = SPECTRUMS[state.order[state.round % state.order.length] ?? 0];
      if (!spectrum) return state;
      return {
        ...state,
        phase: 'clue',
        spectrum,
        target: 3 + Math.floor(ctx.random() * 95), // 3..97
        dial: 50,
        guess: 50,
        psychicId: ctx.playerId,
        psychicName: ctx.players.find((p) => p.id === ctx.playerId)?.name ?? null,
      };
    },

    /** Psychic said the clue out loud — open the dial to the team. */
    clueGiven(state, ctx) {
      if (state.phase !== 'clue' || ctx.playerId !== state.psychicId) return state;
      return { ...state, phase: 'guess' };
    },

    /**
     * Move the shared needle. Deliberately accepted from ANY hand device —
     * with one shared phone the psychic's device may be the only one, so the
     * server can't tell psychic-cheating from legit dialing; the psychic's
     * hand view hides the controls instead ("hands off").
     */
    setDial(state, ctx, v: number) {
      if (state.phase !== 'guess' || ctx.role !== 'hand') return state;
      if (!Number.isInteger(v) || v < 0 || v > 100) return state;
      if (v === state.dial) return state;
      return { ...state, dial: v };
    },

    /** Lock the needle: score the round's team and show the reveal. */
    lockIn(state, ctx) {
      if (state.phase !== 'guess' || ctx.role !== 'hand') return state;
      const points = pointsFor(Math.abs(state.target - state.dial));
      const scores = [...state.scores];
      const team = state.round % 2;
      scores[team] = (scores[team] ?? 0) + points;
      return {
        ...state,
        phase: 'reveal',
        guess: state.dial,
        scores,
        lastPoints: points,
        endsAt: ctx.now + REVEAL_MS,
      };
    },

    /** Reveal timer ran out (sent on a client timer; idempotent). */
    nextRound(state, ctx) {
      if (state.phase !== 'reveal' || ctx.now < state.endsAt - 250) return state;
      const round = state.round + 1;
      if (round >= state.totalRounds) {
        return { ...state, phase: 'done', round, psychicId: null, psychicName: null };
      }
      return {
        ...state,
        phase: 'ready',
        round,
        spectrum: null,
        target: 0,
        dial: 50,
        guess: 50,
        lastPoints: 0,
        endsAt: 0,
        psychicId: null,
        psychicName: null,
      };
    },
  },

  playerView(state, { playerId }) {
    const iAmPsychic = playerId !== null && playerId === state.psychicId;
    const revealed = state.phase === 'reveal' || state.phase === 'done';
    const psychicSees = iAmPsychic && (state.phase === 'clue' || state.phase === 'guess');
    return {
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      scores: state.scores,
      spectrum: state.spectrum,
      target: revealed || psychicSees ? state.target : null,
      dial: state.dial,
      guess: state.guess,
      lastPoints: state.lastPoints,
      endsAt: state.endsAt,
      revealMs: REVEAL_MS,
      iAmPsychic,
      psychicName: state.psychicName,
    };
  },

  isOver(state) {
    if (state.phase !== 'done') return null;
    const [red = 0, blue = 0] = state.scores;
    if (red > blue) return { text: `🔴 Red reads minds best — ${red}–${blue}! 🏆` };
    if (blue > red) return { text: `🔵 Blue reads minds best — ${blue}–${red}! 🏆` };
    return { text: `Perfectly in sync — it's a tie, ${red}–${blue}!` };
  },
};

export default game;
