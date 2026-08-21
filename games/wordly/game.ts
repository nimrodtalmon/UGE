import type { GameDef } from '../../src/shared/plugin.js';
import { pickGuess, readyToGuess } from './bot.js';
import {
  MAX_GUESSES,
  WORD_LENGTH,
  isAllowedGuess,
  mergeKeys,
  normalizeGuess,
  pickAnswer,
  scoreGuess,
} from './lib.js';
import type { Mark } from './lib.js';

export type { Mark };

/** One submitted guess, as the server stores it. */
export interface Row {
  word: string;
  marks: Mark[];
}

interface Seat {
  guesses: Row[];
  solved: boolean;
  /** Solved, or all six tries spent — either way this player is done. */
  finished: boolean;
  /** Best mark per letter so far (a–z), for the on-screen keyboard. */
  keys: Record<string, Mark>;
  /** Last guess that wasn't a known word, with the server time it happened. */
  rejected: { word: string; at: number } | null;
}

export interface WordlyState {
  race: boolean;
  /** The secret. Never put this in a view before a device may know it. */
  answer: string;
  names: string[];
  seats: Seat[];
}

/** A row as one device may see it: `word` is null when its letters are secret. */
export interface ViewRow {
  word: string | null;
  marks: Mark[];
}

export interface ViewBoard {
  name: string;
  rows: ViewRow[];
  /** Guesses spent — the only thing rivals learn while a race is running. */
  used: number;
  solved: boolean;
  finished: boolean;
}

export interface WordlyView {
  race: boolean;
  maxGuesses: number;
  wordLength: number;
  /** This device's seat, or -1 for the table and for spectators. */
  myIndex: number;
  boards: ViewBoard[];
  /** My keyboard tints (empty for devices holding no seat). */
  keys: Record<string, Mark>;
  /** My last not-a-word guess — the view shakes it off after a moment. */
  rejected: { word: string; at: number } | null;
  /** The answer, only once this device is allowed to know it. */
  answer: string | null;
  /** Rank order: solved first, then fewest guesses. Never carries letters. */
  standings: { name: string; solved: boolean; used: number }[];
}

const emptySeat = (): Seat => ({
  guesses: [],
  solved: false,
  finished: false,
  keys: {},
  rejected: null,
});

const withSeat = (state: WordlyState, index: number, seat: Seat): WordlyState => ({
  ...state,
  seats: state.seats.map((s, i) => (i === index ? seat : s)),
});

const allDone = (state: WordlyState): boolean => state.seats.every((s) => s.finished);

function standingsOf(state: WordlyState): { name: string; solved: boolean; used: number }[] {
  return state.seats
    .map((s, i) => ({
      name: state.names[i] ?? `Player ${i + 1}`,
      solved: s.solved,
      used: s.guesses.length,
    }))
    .sort((a, b) => Number(b.solved) - Number(a.solved) || a.used - b.used);
}

const game: GameDef<WordlyState, WordlyView> = {
  setup({ players, random, mode }) {
    return {
      race: mode.id === 'race',
      // one word per game: in a race everybody hunts the same one
      answer: pickAnswer(random),
      names: players.map((p) => p.name),
      seats: players.map(() => emptySeat()),
    };
  },

  moves: {
    guess(state, ctx, word: string) {
      if (ctx.role === 'table') return state; // the table is display-only
      const index = ctx.players.findIndex((p) => p.id === ctx.playerId);
      const seat = index >= 0 ? state.seats[index] : undefined;
      if (!seat || seat.finished) return state;

      const clean = normalizeGuess(word);
      if (clean === null) return state; // junk from a hostile client: ignore it
      if (!isAllowedGuess(clean)) {
        // not a word we know — costs no try, but the phone gets to shake
        return withSeat(state, index, { ...seat, rejected: { word: clean, at: ctx.now } });
      }

      const marks = scoreGuess(clean, state.answer);
      const guesses = [...seat.guesses, { word: clean, marks }];
      const solved = clean === state.answer;
      return withSeat(state, index, {
        guesses,
        solved,
        finished: solved || guesses.length >= MAX_GUESSES,
        keys: mergeKeys(seat.keys, clean, marks),
        rejected: null,
      });
    },
  },

  playerView(state, { playerId, role, players }) {
    const over = allDone(state);
    const myIndex = players.findIndex((p) => p.id === playerId);
    const me = myIndex >= 0 ? state.seats[myIndex] : undefined;
    // The table may mirror letters in exactly one case: a lone solo player
    // looking at their own second screen. Any other shape (a race, or several
    // people at one table) would hand rivals the board.
    const tableMirrors = role === 'table' && !state.race && state.seats.length === 1;

    return {
      race: state.race,
      maxGuesses: MAX_GUESSES,
      wordLength: WORD_LENGTH,
      myIndex,
      boards: state.seats.map((seat, i) => {
        const letters = over || i === myIndex || tableMirrors;
        return {
          name: state.names[i] ?? `Player ${i + 1}`,
          rows: seat.guesses.map((g) => ({ word: letters ? g.word : null, marks: g.marks })),
          used: seat.guesses.length,
          solved: seat.solved,
          finished: seat.finished,
        };
      }),
      keys: me?.keys ?? {},
      rejected: me?.rejected ?? null,
      // the secret goes out only to a player who is done, and to everyone
      // once the whole game is
      answer: over || me?.finished ? state.answer : null,
      standings: standingsOf(state),
    };
  },

  isOver(state) {
    if (state.seats.length === 0 || !allDone(state)) return null;
    const word = state.answer.toUpperCase();

    if (!state.race && state.seats.length === 1) {
      const only = state.seats[0]!;
      return only.solved
        ? { text: `🔤 Got it in ${only.guesses.length}!` }
        : { text: `🔤 Out of tries — the word was ${word}` };
    }

    const solvers = standingsOf(state).filter((s) => s.solved);
    if (solvers.length === 0) return { text: `🔤 Nobody got it — the word was ${word}` };
    const best = solvers[0]!.used;
    const winners = solvers.filter((s) => s.used === best);
    return winners.length === 1
      ? { text: `🔤 ${winners[0]!.name} got it in ${best}!` }
      : { text: `🔤 Tie — ${winners.map((w) => w.name).join(' & ')} got it in ${best}!` };
  },

  /**
   * AI opponent — see bot.ts. It races: only its own rows are handed over, so
   * `state.answer` is out of its reach by construction and it hunts the word
   * from its own green/yellow/grey like everybody else. A bot alone with the
   * word would be pointless, but a bot seated beside a player still has to
   * play — a seat that never guesses would leave the game unfinishable.
   */
  bot(state, { seat, level, random, now }) {
    if (!state.race && state.seats.length <= 1) return null;
    const me = state.seats[seat];
    if (!me || me.finished) return null;
    if (!readyToGuess(now, seat, me.guesses.length, level)) return null;
    return { name: 'guess', args: [pickGuess(me.guesses, level, random)] };
  },
};

export default game;
