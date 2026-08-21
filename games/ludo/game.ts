import type { GameDef, MoveCtx } from '../../src/shared/plugin.js';
import { pickToken } from './bot.js';

/**
 * Ludo / Parcheesi. Four tokens race out of a base, once round a 52-square
 * ring and up a private home column. Everything here is public — the whole
 * game is the board, one die and whose turn it is — so `playerView` only adds
 * "which seat am I".
 *
 * Geometry lives in this file (and is exported) so the views and the bot all
 * read the same board: one 15x15 grid, four quadrants of 13 ring squares each,
 * rotated a quarter turn at a time.
 */

/** Squares on the shared ring. */
export const RING = 52;
/** Progress value of the first home-column square. */
export const HOME_COL = 52;
/** Progress value of a token that has finished. */
export const HOME = 57;
/** Progress value of a token still in its base. */
export const BASE = -1;

/** Each colour starts a quarter of the ring apart. */
export const START = [0, 13, 26, 39];
/** The four start squares plus the four starred squares: no capturing here. */
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
const isSafe = (a: number): boolean => SAFE.includes(a);

export type Cell = { r: number; c: number };

/** A quarter turn clockwise about the centre of the 15x15 board. */
const rot = (cell: Cell): Cell => ({ r: cell.c, c: 14 - cell.r });
function rotN(cell: Cell, times: number): Cell {
  let out = cell;
  for (let i = 0; i < times; i++) out = rot(out);
  return out;
}

/** The 13 ring squares of the top-left quadrant, in travel order. */
const QUADRANT: Cell[] = [
  { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 },
  { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 },
  { r: 0, c: 6 }, { r: 0, c: 7 }, { r: 0, c: 8 },
];

/** The whole ring, square 0 first (red's start), clockwise. */
export const RING_CELLS: Cell[] = [0, 1, 2, 3].flatMap((q) =>
  QUADRANT.map((cell) => rotN(cell, q)),
);

/** Colour `q`'s five home-column squares, from the ring inwards. */
export const homeCells = (q: number): Cell[] =>
  [1, 2, 3, 4, 5].map((c) => rotN({ r: 7, c }, q));

/** The four parked-token slots inside colour `q`'s base. */
export const baseCells = (q: number): Cell[] =>
  [{ r: 1, c: 1 }, { r: 1, c: 4 }, { r: 4, c: 1 }, { r: 4, c: 4 }].map((cell) => rotN(cell, q));

/** The 6x6 corner a colour parks in: its top-left cell. */
export const yardCorner = (q: number): Cell => rotN({ r: 0, c: 0 }, q);

/** Ring square a token of colour `q` stands on at progress `t` (0..51). */
export const ringSquare = (q: number, t: number): number => ((START[q] ?? 0) + t) % RING;

/** Where a token sits on the 15x15 grid, or null while it is in its base. */
export function cellOf(q: number, t: number, tokenIndex: number): Cell {
  if (t === BASE) return baseCells(q)[tokenIndex] ?? { r: 7, c: 7 };
  if (t >= HOME) return { r: 7, c: 7 };
  if (t >= HOME_COL) return homeCells(q)[t - HOME_COL] ?? { r: 7, c: 7 };
  return RING_CELLS[ringSquare(q, t)] ?? { r: 7, c: 7 };
}

/** Seat -> quadrant. Two players sit opposite each other. */
const COLOURS: Record<number, number[]> = {
  1: [0],
  2: [0, 2],
  3: [0, 1, 2],
  4: [0, 1, 2, 3],
};
export const COLOUR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];

export type Phase = 'roll' | 'move';

export interface LudoState {
  /** Seat -> board quadrant (0 red, 1 green, 2 yellow, 3 blue). */
  colours: number[];
  /** Seat -> per-token progress: -1 base, 0..51 ring, 52..56 home column, 57 home. */
  tokens: number[][];
  tokensPer: number;
  turn: number;
  phase: Phase;
  /** The die on the table (kept for display after the turn passes). */
  die: number | null;
  /** Consecutive sixes rolled in this turn; the third one costs the turn. */
  sixes: number;
  /** Token indexes the roll may be played with (phase 'move'). */
  legal: number[];
  /** The beat that explains what just happened ("no legal move", a capture). */
  note: string | null;
  noteSeat: number | null;
  /** Last token to move, for a highlight. */
  lastMoved: { seat: number; token: number } | null;
  /** Last token sent home, for a flash. */
  lastCapture: { seat: number; token: number } | null;
  names: string[];
  winner: number | null;
}

/** Ludo hides nothing — the view is the state plus which seat is reading it. */
export interface LudoView extends LudoState {
  myIndex: number;
}

const nextSeat = (state: LudoState, seat: number): number => (seat + 1) % state.tokens.length;

/** Opponent tokens standing on ring square `a`, as [seat, tokenIndex] pairs. */
export function occupantsOf(state: LudoState, a: number, exceptSeat: number): [number, number][] {
  const out: [number, number][] = [];
  state.tokens.forEach((row, seat) => {
    if (seat === exceptSeat) return;
    const q = state.colours[seat] ?? 0;
    row.forEach((t, i) => {
      if (t >= 0 && t < RING && ringSquare(q, t) === a) out.push([seat, i]);
    });
  });
  return out;
}

/** Own tokens standing on ring square `a`. */
export function ownOn(state: LudoState, seat: number, a: number): number {
  const q = state.colours[seat] ?? 0;
  return (state.tokens[seat] ?? []).filter((t) => t >= 0 && t < RING && ringSquare(q, t) === a)
    .length;
}

/** Where token `i` of `seat` lands with `die`, or null when the move is illegal. */
export function destinationOf(state: LudoState, seat: number, i: number, die: number): number | null {
  const t = state.tokens[seat]?.[i];
  if (t === undefined || t >= HOME) return null;
  const to = t === BASE ? (die === 6 ? 0 : null) : t + die;
  if (to === null) return null;
  if (to > HOME) return null; // an exact count is needed to come home
  if (to >= HOME_COL) return to; // the home column is private: always free
  const a = ringSquare(state.colours[seat] ?? 0, to);
  if (isSafe(a)) return to; // a safe square takes everyone
  // two or more enemy tokens hold the square as a block
  return occupantsOf(state, a, seat).length >= 2 ? null : to;
}

/** Every token `seat` may legally play `die` with. */
export function legalTokens(state: LudoState, seat: number, die: number): number[] {
  const row = state.tokens[seat] ?? [];
  return row.map((_, i) => i).filter((i) => destinationOf(state, seat, i, die) !== null);
}

const nameOf = (state: LudoState, seat: number): string =>
  state.names[seat] ?? COLOUR_NAMES[state.colours[seat] ?? 0] ?? 'Player';

const isTurnOwner = (state: LudoState, ctx: MoveCtx): boolean =>
  ctx.players[state.turn]?.id === ctx.playerId;

const game: GameDef<LudoState, LudoView> = {
  setup({ players, mode }) {
    const raw = mode.config['tokens'];
    const tokensPer = raw === 2 ? 2 : 4;
    const seats = Math.max(1, Math.min(4, players.length));
    const colours = COLOURS[seats] ?? [0, 1, 2, 3];
    return {
      colours: [...colours],
      tokens: colours.map(() => new Array<number>(tokensPer).fill(BASE)),
      tokensPer,
      turn: 0,
      phase: 'roll',
      die: null,
      sixes: 0,
      legal: [],
      note: null,
      noteSeat: null,
      lastMoved: null,
      lastCapture: null,
      names: colours.map((q, i) => players[i]?.name ?? COLOUR_NAMES[q] ?? `Player ${i + 1}`),
      winner: null,
    };
  },

  moves: {
    /** Throw the die. A turn with nothing to play passes itself, with a note. */
    roll(state, ctx) {
      if (state.winner !== null || state.phase !== 'roll') return state;
      if (!isTurnOwner(state, ctx)) return state;
      const seat = state.turn;
      const die = 1 + Math.floor(ctx.random() * 6);

      if (die === 6 && state.sixes >= 2) {
        return {
          ...state,
          die,
          sixes: 0,
          legal: [],
          turn: nextSeat(state, seat),
          note: `${nameOf(state, seat)} rolled a third six — turn lost`,
          noteSeat: seat,
          lastCapture: null,
        };
      }

      const legal = legalTokens(state, seat, die);
      if (legal.length === 0) {
        return {
          ...state,
          die,
          sixes: 0,
          legal: [],
          turn: nextSeat(state, seat),
          note:
            die === 6
              ? `${nameOf(state, seat)} rolled a 6 — no legal move`
              : `${nameOf(state, seat)} rolled ${die} — no legal move (a 6 frees a token)`,
          noteSeat: seat,
          lastCapture: null,
        };
      }

      return {
        ...state,
        die,
        sixes: die === 6 ? state.sixes + 1 : 0,
        legal,
        phase: 'move',
        note: null,
        noteSeat: null,
        lastCapture: null,
      };
    },

    /** Play the die with one token. */
    moveToken(state, ctx, index: number) {
      if (state.winner !== null || state.phase !== 'move') return state;
      if (!isTurnOwner(state, ctx)) return state;
      if (!Number.isInteger(index)) return state;
      const die = state.die;
      if (die === null || die < 1 || die > 6) return state;
      const seat = state.turn;
      const to = destinationOf(state, seat, index, die);
      if (to === null) return state;

      const tokens = state.tokens.map((row) => [...row]);
      const row = tokens[seat];
      if (!row) return state;
      row[index] = to;

      let lastCapture: { seat: number; token: number } | null = null;
      let note: string | null = null;
      if (to < RING) {
        const a = ringSquare(state.colours[seat] ?? 0, to);
        if (!isSafe(a)) {
          for (const [victim, tokenIndex] of occupantsOf(state, a, seat)) {
            const victimRow = tokens[victim];
            if (victimRow) victimRow[tokenIndex] = BASE;
            lastCapture = { seat: victim, token: tokenIndex };
            note = `${nameOf(state, seat)} sent ${nameOf(state, victim)} home!`;
          }
        }
      } else if (to === HOME) {
        const done = row.filter((t) => t === HOME).length;
        note = `${nameOf(state, seat)} brings a token home (${done}/${state.tokensPer})`;
      }

      const won = row.every((t) => t === HOME);
      const again = die === 6 && !won;
      return {
        ...state,
        tokens,
        legal: [],
        phase: 'roll',
        turn: again ? seat : nextSeat(state, seat),
        sixes: again ? state.sixes : 0,
        note,
        noteSeat: note === null ? null : seat,
        lastMoved: { seat, token: index },
        lastCapture,
        winner: won ? seat : null,
      };
    },
  },

  playerView(state, { playerId, players }) {
    return { ...state, myIndex: players.findIndex((p) => p.id === playerId) };
  },

  isOver(state) {
    if (state.winner === null) return null;
    return {
      text: `🏁 ${nameOf(state, state.winner)} gets all ${state.tokensPer} tokens home — Ludo!`,
    };
  },

  /**
   * AI opponent. A turn is two questions — throw, then which token — so each
   * call answers only the next one; the platform asks again.
   */
  bot(state, { seat, level, random }) {
    if (state.winner !== null || state.turn !== seat) return null;
    if (state.phase === 'roll') return { name: 'roll' };
    const die = state.die;
    if (die === null) return { name: 'roll' };
    const index = pickToken(state, seat, die, level, random);
    return index === null ? null : { name: 'moveToken', args: [index] };
  },
};

export default game;
