import type { GameDef } from '../../src/shared/plugin.js';
import wordsJson from './assets/words.en.json' with { type: 'json' };

const WORDS = wordsJson as string[];
const DRAW_MS = 75_000;
const REVEAL_MS = 5_000;
const MAX_STROKES = 500;
const MAX_POINTS = 512; // numbers per stroke (x,y pairs)

export interface Stroke {
  c: string; // color
  p: number[]; // x0,y0,x1,y1,… in a 0..1000 space
}

export interface SketchState {
  phase: 'draw' | 'reveal' | 'done';
  round: number; // 0-based; drawer = round % players
  totalRounds: number;
  word: string;
  usedWords: string[];
  strokes: Stroke[];
  guessed: number[]; // seats in guess order
  wrong: { name: string; text: string }[];
  scores: number[];
  endsAt: number;
  names: string[];
  ids: string[];
}

export interface SketchView {
  phase: 'draw' | 'reveal' | 'done';
  round: number;
  totalRounds: number;
  drawer: number;
  /** The word for the drawer (and everyone at reveal); a "_ _ _" hint otherwise. */
  word: string | null;
  hint: string;
  strokes: Stroke[];
  guessed: number[];
  wrong: { name: string; text: string }[];
  scores: number[];
  endsAt: number;
  names: string[];
  myIndex: number;
  iGuessed: boolean;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function pickWord(state: { usedWords: string[] }, random: () => number): string {
  const fresh = WORDS.filter((w) => !state.usedWords.includes(w));
  const pool = fresh.length > 0 ? fresh : WORDS;
  return pool[Math.floor(random() * pool.length)]!;
}

function startRound(s: SketchState, random: () => number, now: number): SketchState {
  const word = pickWord(s, random);
  return {
    ...s,
    phase: 'draw',
    word,
    usedWords: [...s.usedWords, word],
    strokes: [],
    guessed: [],
    wrong: [],
    endsAt: now + DRAW_MS,
  };
}

const drawerOf = (s: SketchState) => s.round % s.names.length;

const game: GameDef<SketchState, SketchView> = {
  setup({ players, random, now }) {
    const base: SketchState = {
      phase: 'draw',
      round: 0,
      // three drawings per player (capped) — one round each was over too fast
      totalRounds: Math.max(4, Math.min(players.length * 3, 15)),
      word: '',
      usedWords: [],
      strokes: [],
      guessed: [],
      wrong: [],
      scores: players.map(() => 0),
      endsAt: 0,
      names: players.map((p) => p.name),
      ids: players.map((p) => p.id),
    };
    return startRound(base, random, now);
  },

  moves: {
    stroke(state, ctx, color: string, points: number[]) {
      if (state.phase !== 'draw' || ctx.playerId !== state.ids[drawerOf(state)]) return state;
      if (!Array.isArray(points) || points.length < 4 || points.length > MAX_POINTS) return state;
      if (points.some((n) => typeof n !== 'number' || n < 0 || n > 1000)) return state;
      if (state.strokes.length >= MAX_STROKES) return state;
      const c = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : '#222222';
      return { ...state, strokes: [...state.strokes, { c, p: points.map((n) => Math.round(n)) }] };
    },

    clear(state, ctx) {
      if (state.phase !== 'draw' || ctx.playerId !== state.ids[drawerOf(state)]) return state;
      return { ...state, strokes: [] };
    },

    guess(state, ctx, text: string) {
      if (state.phase !== 'draw' || typeof text !== 'string') return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat < 0 || seat === drawerOf(state) || state.guessed.includes(seat)) return state;
      if (normalize(text) !== normalize(state.word)) {
        const wrong = [...state.wrong, { name: state.names[seat] ?? '?', text: text.slice(0, 24) }];
        return { ...state, wrong: wrong.slice(-5) };
      }
      const guessed = [...state.guessed, seat];
      const scores = [...state.scores];
      scores[seat] = (scores[seat] ?? 0) + (guessed.length === 1 ? 3 : 2); // speed bonus
      scores[drawerOf(state)] = (scores[drawerOf(state)] ?? 0) + 1;
      const everyone = guessed.length >= state.names.length - 1;
      return {
        ...state,
        guessed,
        scores,
        phase: everyone ? 'reveal' : state.phase,
        endsAt: everyone ? ctx.now + REVEAL_MS : state.endsAt,
      };
    },

    /** Draw timer ran out (table timer; idempotent). */
    timeUp(state, ctx) {
      if (state.phase !== 'draw' || ctx.now < state.endsAt - 250) return state;
      return { ...state, phase: 'reveal', endsAt: ctx.now + REVEAL_MS };
    },

    /** Advance past the reveal (table timer; idempotent). */
    next(state, ctx) {
      if (state.phase !== 'reveal' || ctx.now < state.endsAt - 250) return state;
      const round = state.round + 1;
      if (round >= state.totalRounds) return { ...state, phase: 'done' };
      return startRound({ ...state, round }, ctx.random, ctx.now);
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    const drawer = drawerOf(state);
    const showWord = state.phase !== 'draw' || myIndex === drawer;
    return {
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      drawer,
      word: showWord ? state.word : null,
      hint: state.word
        .split(' ')
        .map((w) => '_'.repeat(w.length))
        .join('  '),
      strokes: state.strokes,
      guessed: state.guessed,
      wrong: state.wrong,
      scores: state.scores,
      endsAt: state.endsAt,
      names: state.names,
      myIndex,
      iGuessed: myIndex >= 0 && state.guessed.includes(myIndex),
    };
  },

  isOver(state) {
    if (state.phase !== 'done') return null;
    const top = Math.max(...state.scores);
    const winners = state.names.filter((_, i) => state.scores[i] === top);
    return winners.length === 1
      ? { text: `🎨 ${winners[0]} wins with ${top} points!` }
      : { text: `Tie — ${winners.join(' & ')} (${top} points)` };
  },
};

export default game;
