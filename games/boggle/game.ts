import type { GameDef } from '../../src/shared/plugin.js';
import { normalizeWord, rollGrid, scoreWord, tracePath } from './lib.js';
import { isWord, solve } from './words.js';

const DEFAULT_MS = 180_000;
/** How many of the board's best unclaimed words the results screen shows. */
const MISSED_SHOWN = 6;

/** Why a word bounced — the phone turns this into one short line. */
export type Reason = 'short' | 'dup' | 'unknown' | 'path';

export interface Verdict {
  word: string;
  /** Points it would be worth on its own; 0 for a rejection. */
  points: number;
  /** null when the word was accepted. */
  reason: Reason | null;
  at: number;
}

export interface BoggleState {
  phase: 'play' | 'done';
  size: number;
  minLen: number;
  /** One face per tile, uppercase; "QU" is a single tile carrying two letters. */
  letters: string[];
  startedAt: number;
  endsAt: number;
  names: string[];
  /** Per seat, the words accepted so far. SECRET until the round ends. */
  words: string[][];
  /** Per seat, the last thing that happened to a word — that phone only. */
  last: (Verdict | null)[];
  /** Everything the board contains, from the solver. The ceiling to play against. */
  bestWords: string[];
  bestPoints: number;
}

export interface SeatResult {
  seat: number;
  /** Words nobody else found — these are the ones that score. */
  unique: { word: string; points: number }[];
  /** Words someone else found too: zero for everyone, which is the whole game. */
  dupes: string[];
  points: number;
}

export interface BoggleView {
  phase: 'play' | 'done';
  size: number;
  minLen: number;
  letters: string[];
  startedAt: number;
  endsAt: number;
  names: string[];
  /** How many words each player has in — public. The words themselves are not. */
  counts: number[];
  myIndex: number;
  /** This device's own words, and nobody else's, until the round is over. */
  myWords: string[];
  /** What my words are worth before duplicates are cancelled. */
  myRaw: number;
  last: Verdict | null;
  bestPoints: number;
  bestCount: number;
  solo: boolean;
  /** Filled only once the round has ended. */
  results: SeatResult[] | null;
  missed: { word: string; points: number }[] | null;
}

/**
 * Scoring, once the whistle blows. Length scoring first, then the rule the
 * whole game turns on: a word two or more players wrote is struck out for
 * ALL of them.
 */
export function resultsOf(state: BoggleState): SeatResult[] {
  const seen = new Map<string, number>();
  for (const list of state.words) for (const w of new Set(list)) seen.set(w, (seen.get(w) ?? 0) + 1);

  return state.words.map((list, seat) => {
    const unique: { word: string; points: number }[] = [];
    const dupes: string[] = [];
    for (const word of list) {
      if ((seen.get(word) ?? 0) > 1) dupes.push(word);
      else unique.push({ word, points: scoreWord(word) });
    }
    unique.sort((a, b) => b.points - a.points || (a.word < b.word ? -1 : 1));
    return {
      seat,
      unique,
      dupes,
      points: unique.reduce((sum, u) => sum + u.points, 0),
    };
  });
}

const withSeat = <T>(list: T[], seat: number, value: T): T[] =>
  list.map((v, i) => (i === seat ? value : v));

const game: GameDef<BoggleState, BoggleView> = {
  setup({ players, random, now, mode }) {
    const rawSize = mode.config['size'];
    const size = rawSize === 5 ? 5 : 4;
    const rawSeconds = mode.config['seconds'];
    const ms =
      typeof rawSeconds === 'number' && rawSeconds >= 30 && rawSeconds <= 900
        ? Math.round(rawSeconds) * 1000
        : DEFAULT_MS;
    // Big Boggle's four-letter minimum; the small board keeps three.
    const minLen = size === 5 ? 4 : 3;
    const letters = rollGrid(size, random);
    const best = solve(letters, size, minLen);
    return {
      phase: 'play',
      size,
      minLen,
      letters,
      startedAt: now,
      endsAt: now + ms,
      names: players.map((p) => p.name),
      words: players.map(() => []),
      last: players.map(() => null),
      bestWords: best.words,
      bestPoints: best.points,
    };
  },

  moves: {
    /**
     * Hand in one word. Everything is re-checked here, because the phone that
     * sent it is not to be trusted: the word has to be long enough, new to
     * this player, in the dictionary, AND walkable on this grid.
     */
    submit(state, ctx, rawWord: string) {
      if (state.phase !== 'play') return state;
      if (ctx.role === 'table') return state; // the table is display-only
      if (ctx.now >= state.endsAt + 2_000) return state; // long past the whistle
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat < 0 || seat >= state.words.length) return state;

      const word = normalizeWord(rawWord);
      if (word === null) return state; // junk from a hostile client: no reply at all

      const bounce = (reason: Reason): BoggleState => ({
        ...state,
        last: withSeat(state.last, seat, { word, points: 0, reason, at: ctx.now }),
      });

      if (word.length < state.minLen) return bounce('short');
      if (state.words[seat]!.includes(word)) return bounce('dup');
      if (!isWord(word)) return bounce('unknown');
      if (tracePath(word, state.letters, state.size) === null) return bounce('path');

      return {
        ...state,
        words: withSeat(state.words, seat, [...state.words[seat]!, word]),
        last: withSeat(state.last, seat, { word, points: scoreWord(word), reason: null, at: ctx.now }),
      };
    },

    /** The whistle. Fired by the table and backed up by every phone; idempotent. */
    timeUp(state, ctx) {
      if (state.phase !== 'play' || ctx.now < state.endsAt - 250) return state;
      return { ...state, phase: 'done' };
    },
  },

  /**
   * The privacy rule this game lives or dies by: while the round is running a
   * device is told its OWN words and nothing but a count for everybody else.
   * Whatever goes out here is one devtools tab away from being read.
   */
  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    const done = state.phase === 'done';
    const results = done ? resultsOf(state) : null;
    const mine = myIndex >= 0 ? state.words[myIndex]! : [];

    let missed: { word: string; points: number }[] | null = null;
    if (done) {
      const taken = new Set(state.words.flat());
      missed = state.bestWords
        .filter((w) => !taken.has(w))
        .slice(0, MISSED_SHOWN)
        .map((w) => ({ word: w, points: scoreWord(w) }));
    }

    return {
      phase: state.phase,
      size: state.size,
      minLen: state.minLen,
      letters: state.letters,
      startedAt: state.startedAt,
      endsAt: state.endsAt,
      names: state.names,
      counts: state.words.map((w) => w.length),
      myIndex,
      myWords: mine,
      myRaw: mine.reduce((sum, w) => sum + scoreWord(w), 0),
      last: myIndex >= 0 ? (state.last[myIndex] ?? null) : null,
      bestPoints: state.bestPoints,
      bestCount: state.bestWords.length,
      solo: state.words.length === 1,
      results,
      missed,
    };
  },

  isOver(state) {
    if (state.phase !== 'done') return null;
    const results = resultsOf(state);
    if (results.length === 0) return { text: '🎲 Time!' };
    if (results.length === 1) {
      const only = results[0]!;
      return { text: `🎲 ${only.points} of ${state.bestPoints} points on the board` };
    }
    const top = Math.max(...results.map((r) => r.points));
    const winners = results.filter((r) => r.points === top).map((r) => state.names[r.seat] ?? '?');
    return winners.length === 1
      ? { text: `🎲 ${winners[0]} wins with ${top} points!` }
      : { text: `🎲 Tie — ${winners.join(' & ')} on ${top}` };
  },
};

export default game;
