import type { GameDef } from '../../src/shared/plugin.js';
import categoriesJson from './assets/categories.en.json' with { type: 'json' };

const CATEGORIES = categoriesJson as string[];
const LETTERS = 'ABCDEFGHILMNOPRSTW'; // easy letters only
const ROUNDS = 3;
const CATS_PER_ROUND = 5;
const WRITE_MS = 75_000;
const CLOSING_MS = 2_500;
const REVEAL_MS = 14_000;
const MAX_ANSWER = 40;

export interface RoundRecord {
  letter: string;
  categories: string[];
  /** Per seat: the 5 answers as submitted, null until that player submits. */
  answers: (string[] | null)[];
  /** Per seat × category points (10/5/0), filled by scoring. */
  cellScores: number[][] | null;
  /** Seat that tapped STOP this round, if any. */
  stopper: number | null;
  /** Did the stopper earn the +5 all-valid bonus? */
  stopperBonus: boolean;
}

export interface StopState {
  phase: 'write' | 'closing' | 'reveal' | 'done';
  round: number; // 0-based
  rounds: RoundRecord[];
  scores: number[]; // running totals
  endsAt: number;
  names: string[];
  ids: string[];
}

/** What clients see — during write/closing nobody sees any typed answers. */
export interface StopView {
  phase: 'write' | 'closing' | 'reveal' | 'done';
  round: number;
  totalRounds: number;
  letter: string;
  categories: string[];
  /** Who has already locked in this round (public; the texts are not). */
  submitted: boolean[];
  stopper: number | null;
  scores: number[];
  endsAt: number;
  names: string[];
  myIndex: number;
  iSubmitted: boolean;
  /** Reveal/done only: everyone's answers and per-cell points; null before. */
  answers: (string[] | null)[] | null;
  cellScores: number[][] | null;
  stopperBonus: boolean;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Validate a hostile-client answer sheet: exactly 5 strings, capped at 40 chars. */
function cleanAnswers(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length !== CATS_PER_ROUND) return null;
  if (raw.some((a) => typeof a !== 'string')) return null;
  return (raw as string[]).map((a) => a.slice(0, MAX_ANSWER));
}

/** Immutably record one seat's answers (and optionally the stopper) in the current round. */
function record(state: StopState, seat: number, answers: string[], stopper: number | null): RoundRecord[] {
  return state.rounds.map((r, i) =>
    i === state.round
      ? {
          ...r,
          answers: r.answers.map((a, s) => (s === seat ? answers : a)),
          stopper: stopper ?? r.stopper,
        }
      : r,
  );
}

/** Score the current round and enter reveal. */
function computeScores(state: StopState, now: number): StopState {
  const rec = state.rounds[state.round]!;
  const letter = rec.letter.toLowerCase();
  const norm = rec.answers.map((sheet) => rec.categories.map((_, c) => normalize(sheet?.[c] ?? '')));
  const cellScores: number[][] = norm.map((mine) =>
    mine.map((n, c): number => {
      if (n === '' || n[0] !== letter) return 0;
      const dupes = norm.filter((other) => other[c] === n).length;
      return dupes > 1 ? 5 : 10;
    }),
  );
  const stopperBonus =
    rec.stopper !== null && cellScores[rec.stopper]!.every((points) => points > 0);
  const scores = state.scores.map((total, seat) => {
    const gained = cellScores[seat]!.reduce((sum, points) => sum + points, 0);
    return total + gained + (stopperBonus && seat === rec.stopper ? 5 : 0);
  });
  const rounds = state.rounds.map((r, i) =>
    i === state.round ? { ...r, cellScores, stopperBonus } : r,
  );
  return { ...state, rounds, scores, phase: 'reveal', endsAt: now + REVEAL_MS };
}

const game: GameDef<StopState, StopView> = {
  setup({ players, random, now }) {
    const letters = shuffle(LETTERS.split(''), random).slice(0, ROUNDS);
    const cats = shuffle(CATEGORIES, random);
    const rounds: RoundRecord[] = letters.map((letter, r) => ({
      letter,
      categories: cats.slice(r * CATS_PER_ROUND, (r + 1) * CATS_PER_ROUND),
      answers: players.map(() => null),
      cellScores: null,
      stopper: null,
      stopperBonus: false,
    }));
    return {
      phase: 'write',
      round: 0,
      rounds,
      scores: players.map(() => 0),
      endsAt: now + WRITE_MS,
      names: players.map((p) => p.name),
      ids: players.map((p) => p.id),
    };
  },

  moves: {
    /** A player filled all 5 fields and slammed the stop button. */
    stopRound(state, ctx, answersRaw: string[]) {
      if (state.phase !== 'write') return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat < 0) return state;
      const rec = state.rounds[state.round]!;
      if (rec.answers[seat] !== null) return state;
      const answers = cleanAnswers(answersRaw);
      if (!answers || answers.some((a) => a.trim() === '')) return state;
      const rounds = record(state, seat, answers, seat);
      const next: StopState = { ...state, rounds, phase: 'closing', endsAt: ctx.now + CLOSING_MS };
      const all = rounds[state.round]!.answers.every((a) => a !== null);
      return all ? computeScores(next, ctx.now) : next;
    },

    /** A phone hands in whatever is typed (empties allowed); once per round. */
    submitAnswers(state, ctx, answersRaw: string[]) {
      if (state.phase !== 'write' && state.phase !== 'closing') return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat < 0) return state;
      const rec = state.rounds[state.round]!;
      if (rec.answers[seat] !== null) return state;
      const answers = cleanAnswers(answersRaw);
      if (!answers) return state;
      const rounds = record(state, seat, answers, null);
      const next: StopState = { ...state, rounds };
      const all = rounds[state.round]!.answers.every((a) => a !== null);
      return all ? computeScores(next, ctx.now) : next;
    },

    /** Write timer ran out (table timer, phones back it up; idempotent). */
    closeRound(state, ctx) {
      if (state.phase !== 'write' || ctx.now < state.endsAt - 250) return state;
      return { ...state, phase: 'closing', endsAt: ctx.now + CLOSING_MS };
    },

    /** Grace window over — score whatever came in (timer; idempotent). */
    scoreRound(state, ctx) {
      if (state.phase !== 'closing' || ctx.now < state.endsAt - 250) return state;
      return computeScores(state, ctx.now);
    },

    /** Advance past the reveal (timer; idempotent). */
    nextRound(state, ctx) {
      if (state.phase !== 'reveal' || ctx.now < state.endsAt - 250) return state;
      const round = state.round + 1;
      if (round >= ROUNDS) return { ...state, phase: 'done' };
      return { ...state, round, phase: 'write', endsAt: ctx.now + WRITE_MS };
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    const rec = state.rounds[state.round]!;
    const revealed = state.phase === 'reveal' || state.phase === 'done';
    return {
      phase: state.phase,
      round: state.round,
      totalRounds: ROUNDS,
      letter: rec.letter,
      categories: rec.categories,
      submitted: rec.answers.map((a) => a !== null),
      stopper: rec.stopper,
      scores: state.scores,
      endsAt: state.endsAt,
      names: state.names,
      myIndex,
      iSubmitted: myIndex >= 0 && rec.answers[myIndex] !== null,
      answers: revealed ? rec.answers : null,
      cellScores: revealed ? rec.cellScores : null,
      stopperBonus: revealed && rec.stopperBonus,
    };
  },

  isOver(state) {
    if (state.phase !== 'done') return null;
    const top = Math.max(...state.scores);
    const winners = state.names.filter((_, i) => state.scores[i] === top);
    return winners.length === 1
      ? { text: `🛑 ${winners[0]} wins with ${top} points!` }
      : { text: `Tie — ${winners.join(' & ')} (${top} points)` };
  },
};

export default game;
