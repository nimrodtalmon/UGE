import type { GameDef } from '../../src/shared/plugin.js';
import questionsJson from './assets/questions.json' with { type: 'json' };

interface Question {
  q: string;
  choices: string[];
  a: number;
}

const POOL = questionsJson as Question[];
const NUM_QUESTIONS = 10;
const QUESTION_MS = 15_000;
const REVEAL_MS = 3_000;

export interface TriviaState {
  phase: 'question' | 'reveal' | 'done';
  questions: Question[];
  qIdx: number;
  answers: (number | null)[]; // per player, current question
  scores: number[];
  endsAt: number;
  playerNames: string[];
}

/** What clients see — the correct answer stays server-side until reveal. */
export interface TriviaView {
  phase: 'question' | 'reveal' | 'done';
  qIdx: number;
  total: number;
  q: string;
  choices: string[];
  correct: number | null;
  answered: boolean[];
  myAnswer: number | null;
  myIndex: number;
  scores: number[];
  playerNames: string[];
  endsAt: number;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function reveal(state: TriviaState, now: number): TriviaState {
  const correct = state.questions[state.qIdx]!.a;
  return {
    ...state,
    phase: 'reveal',
    endsAt: now + REVEAL_MS,
    scores: state.scores.map((s, i) => (state.answers[i] === correct ? s + 1 : s)),
  };
}

const game: GameDef<TriviaState, TriviaView> = {
  setup({ players, random, now }) {
    return {
      phase: 'question',
      questions: shuffle(POOL, random).slice(0, NUM_QUESTIONS),
      qIdx: 0,
      answers: players.map(() => null),
      scores: players.map(() => 0),
      endsAt: now + QUESTION_MS,
      playerNames: players.map((p) => p.name),
    };
  },

  moves: {
    answer(state, ctx, choice: number) {
      if (state.phase !== 'question') return state;
      const idx = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (idx < 0 || state.answers[idx] !== null) return state;
      const n = state.questions[state.qIdx]!.choices.length;
      if (!Number.isInteger(choice) || choice < 0 || choice >= n) return state;
      const answers = state.answers.map((a, i) => (i === idx ? choice : a));
      const next = { ...state, answers };
      return answers.every((a) => a !== null) ? reveal(next, ctx.now) : next;
    },

    /** Question timer ran out (sent by the table on a timer; idempotent). */
    timeUp(state, ctx) {
      if (state.phase !== 'question' || ctx.now < state.endsAt - 250) return state;
      return reveal(state, ctx.now);
    },

    /** Advance past the reveal (sent by the table on a timer; idempotent). */
    next(state, ctx) {
      if (state.phase !== 'reveal' || ctx.now < state.endsAt - 250) return state;
      const qIdx = state.qIdx + 1;
      if (qIdx >= state.questions.length) return { ...state, phase: 'done' };
      return {
        ...state,
        phase: 'question',
        qIdx,
        answers: state.answers.map(() => null),
        endsAt: ctx.now + QUESTION_MS,
      };
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    const q = state.questions[Math.min(state.qIdx, state.questions.length - 1)]!;
    return {
      phase: state.phase,
      qIdx: state.qIdx,
      total: state.questions.length,
      q: q.q,
      choices: q.choices,
      correct: state.phase === 'question' ? null : q.a,
      answered: state.answers.map((a) => a !== null),
      myAnswer: myIndex >= 0 ? (state.answers[myIndex] ?? null) : null,
      myIndex,
      scores: state.scores,
      playerNames: state.playerNames,
      endsAt: state.endsAt,
    };
  },

  isOver(state) {
    if (state.phase !== 'done') return null;
    const top = Math.max(...state.scores);
    const winners = state.playerNames.filter((_, i) => state.scores[i] === top);
    return winners.length === 1
      ? { text: `${winners[0]} wins with ${top}/${state.questions.length}! 🏆` }
      : { text: `Tie — ${winners.join(' & ')} (${top}/${state.questions.length})` };
  },
};

export default game;
