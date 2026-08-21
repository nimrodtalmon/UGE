import type { GameDef, MoveCtx } from '../../src/shared/plugin.js';
import { pickAsk } from './bot.js';

/**
 * Go Fish. Ask somebody for a rank you already hold; they must hand over every
 * card of it, and you ask again. Miss and you go fishing in the pond. Four of
 * a kind is a book; the thirteenth book ends the game.
 *
 * Hands are secret, so `playerView` sends a device its own cards and nothing
 * else — never another seat's hand, never the order of the pond. Everything a
 * player is allowed to reason with (who asked whom for what, who fished, which
 * books are made, how many cards each hand holds) is in the public `log` and
 * `counts`, which is also all the bot is given.
 */

/** 2..10, then 11 J, 12 Q, 13 K, 14 A. */
export interface GCard {
  r: number;
  s: number;
}

export const SUITS = ['♠', '♥', '♦', '♣'];
const NAMED: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankLabel = (r: number): string => NAMED[r] ?? String(r);
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const BOOKS_TOTAL = 13;

/** One ask, exactly as the whole table saw it. Public information. */
export interface AskEntry {
  n: number;
  asker: number;
  target: number;
  rank: number;
  /** Cards handed over — 0 means "go fish". */
  got: number;
  /** Told to go fish. */
  fished: boolean;
  /** ...and there was still a card in the pond to draw. */
  drew: boolean;
  /** ...and it was the very rank they asked for, so they carried on. */
  drewMatch: boolean;
  /** A book the ask completed, laid face up for everyone to see. */
  booked: number | null;
}

export interface GoFishState {
  hands: GCard[][];
  /** The undealt pile. Its ORDER never leaves the server. */
  pond: GCard[];
  /** Seat -> the ranks it has laid down. */
  books: number[][];
  turn: number;
  /** Every ask so far, oldest first. Public. */
  log: AskEntry[];
  seq: number;
  names: string[];
  over: boolean;
  winners: number[];
}

/** What one device is allowed to see. No other hand, no pond order. */
export interface GoFishView {
  myIndex: number;
  /** Own cards, sorted (null on the table screen and for onlookers). */
  hand: GCard[] | null;
  /** Cards in each hand — public: everyone can count them. */
  counts: number[];
  /** How many cards are left to fish, not which ones. */
  pondCount: number;
  books: number[][];
  turn: number;
  log: AskEntry[];
  names: string[];
  over: boolean;
  winners: number[];
  booksMade: number;
}

const sortHand = (hand: GCard[]): GCard[] => [...hand].sort((a, b) => a.r - b.r || a.s - b.s);

function shuffle(cards: GCard[], random: () => number): GCard[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildDeck(): GCard[] {
  const deck: GCard[] = [];
  for (const r of RANKS) for (let s = 0; s < 4; s++) deck.push({ r, s });
  return deck;
}

const clone = (s: GoFishState): GoFishState => ({
  ...s,
  hands: s.hands.map((h) => [...h]),
  pond: [...s.pond],
  books: s.books.map((b) => [...b]),
  log: [...s.log],
  winners: [...s.winners],
});

/** Lay down any four-of-a-kind in a seat's hand. Returns the ranks booked. */
function collectBooks(s: GoFishState, seat: number): number[] {
  const hand = s.hands[seat];
  if (!hand) return [];
  const made: number[] = [];
  for (const r of RANKS) {
    if (hand.filter((c) => c.r === r).length === 4) made.push(r);
  }
  if (made.length === 0) return [];
  s.hands[seat] = hand.filter((c) => !made.includes(c.r));
  s.books[seat] = [...(s.books[seat] ?? []), ...made];
  return made;
}

const booksMade = (s: GoFishState): number => s.books.reduce((n, b) => n + b.length, 0);

/** Somebody other than `seat` still holds cards, so an ask is possible. */
const hasTarget = (s: GoFishState, seat: number): boolean =>
  s.hands.some((h, i) => i !== seat && h.length > 0);

/** Draw one card for a seat whose hand has run dry. */
function topUp(s: GoFishState, seat: number): void {
  if ((s.hands[seat]?.length ?? 0) > 0 || s.pond.length === 0) return;
  const card = s.pond.pop();
  if (card) s.hands[seat] = sortHand([...(s.hands[seat] ?? []), card]);
}

/** Finish the game and work out who took the most books. */
function finish(s: GoFishState): void {
  s.over = true;
  const best = Math.max(...s.books.map((b) => b.length));
  s.winners = s.books.flatMap((b, i) => (b.length === best ? [i] : []));
}

/**
 * Hand the turn on: the next seat that can actually play. An empty-handed seat
 * draws one card first; a seat with nobody left to ask ends the game.
 */
function passTurn(s: GoFishState, from: number): void {
  const n = s.hands.length;
  for (let k = 1; k <= n; k++) {
    const seat = (from + k) % n;
    topUp(s, seat);
    if ((s.hands[seat]?.length ?? 0) === 0) continue; // nothing to ask with
    if (!hasTarget(s, seat)) break; // nobody left holding cards
    s.turn = seat;
    return;
  }
  finish(s);
}

/** Everything the rules already settled: books made, and whether it is over. */
function settle(s: GoFishState): void {
  if (booksMade(s) >= BOOKS_TOTAL) finish(s);
}

const seatOf = (ctx: MoveCtx): number => ctx.players.findIndex((p) => p.id === ctx.playerId);

const game: GameDef<GoFishState, GoFishView> = {
  setup({ players, random }) {
    const seats = Math.max(2, Math.min(6, players.length));
    const deck = shuffle(buildDeck(), random);
    const each = seats <= 3 ? 7 : 5;
    const s: GoFishState = {
      hands: Array.from({ length: seats }, (_, i) => sortHand(deck.slice(i * each, (i + 1) * each))),
      pond: deck.slice(seats * each),
      books: Array.from({ length: seats }, () => []),
      turn: 0,
      log: [],
      seq: 0,
      names: Array.from({ length: seats }, (_, i) => players[i]?.name ?? `Player ${i + 1}`),
      over: false,
      winners: [],
    };
    for (let i = 0; i < seats; i++) collectBooks(s, i);
    // seat 0 opens, unless the deal left it with nothing to ask with
    passTurn(s, seats - 1);
    settle(s);
    return s;
  },

  moves: {
    /** Ask one player for one rank. You must already hold that rank yourself. */
    ask(state, ctx, target: number, rank: number) {
      if (state.over) return state;
      const seat = seatOf(ctx);
      if (seat < 0 || seat !== state.turn) return state;
      if (!Number.isInteger(target) || !Number.isInteger(rank)) return state;
      if (target < 0 || target >= state.hands.length || target === seat) return state;
      if (!RANKS.includes(rank)) return state;
      const mine = state.hands[seat] ?? [];
      const theirs = state.hands[target] ?? [];
      if (theirs.length === 0) return state; // they hold nothing — nothing to ask
      if (!mine.some((c) => c.r === rank)) return state; // you must hold the rank

      const s = clone(state);
      const entry: AskEntry = {
        n: s.seq + 1,
        asker: seat,
        target,
        rank,
        got: 0,
        fished: false,
        drew: false,
        drewMatch: false,
        booked: null,
      };
      s.seq = entry.n;

      const handed = theirs.filter((c) => c.r === rank);
      let again: boolean;
      if (handed.length > 0) {
        s.hands[target] = theirs.filter((c) => c.r !== rank);
        s.hands[seat] = sortHand([...mine, ...handed]);
        entry.got = handed.length;
        again = true;
      } else {
        entry.fished = true;
        const card = s.pond.pop();
        if (card) {
          s.hands[seat] = sortHand([...mine, card]);
          entry.drew = true;
          entry.drewMatch = card.r === rank;
        }
        again = entry.drewMatch;
      }

      const made = collectBooks(s, seat);
      entry.booked = made[0] ?? null;
      s.log = [...s.log, entry];

      if (again) {
        topUp(s, seat); // booked itself empty: fish for a fresh card
        if ((s.hands[seat]?.length ?? 0) === 0 || !hasTarget(s, seat)) passTurn(s, seat);
      } else {
        passTurn(s, seat);
      }
      settle(s);
      return s;
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    return {
      myIndex,
      hand: myIndex >= 0 ? (state.hands[myIndex] ?? null) : null,
      counts: state.hands.map((h) => h.length),
      pondCount: state.pond.length,
      books: state.books,
      turn: state.turn,
      log: state.log,
      names: state.names,
      over: state.over,
      winners: state.winners,
      booksMade: booksMade(state),
    };
  },

  isOver(state) {
    if (!state.over) return null;
    const names = state.winners.map((i) => state.names[i] ?? `Player ${i + 1}`);
    const books = state.books[state.winners[0] ?? 0]?.length ?? 0;
    if (names.length > 1) {
      return { text: `🐟 ${names.join(' & ')} tie on ${books} books!` };
    }
    return { text: `🐟 ${names[0] ?? 'Nobody'} lands ${books} books — Go Fish! 🏆` };
  },

  /**
   * AI opponent. It is handed ONLY what its own seat may see: its cards, the
   * public ask log, the hand sizes and the books on the table. Nothing here
   * passes another seat's hand or the pond to the bot.
   */
  bot(state, { seat, level, random }) {
    if (state.over || state.turn !== seat) return null;
    const hand = state.hands[seat];
    if (!hand || hand.length === 0) return null;
    const choice = pickAsk({
      seat,
      hand: hand.map((c) => ({ r: c.r, s: c.s })),
      counts: state.hands.map((h) => h.length),
      books: state.books.map((b) => [...b]),
      log: state.log.map((e) => ({ ...e })),
      level,
      random,
    });
    return choice === null ? null : { name: 'ask', args: [choice.target, choice.rank] };
  },
};

export default game;
