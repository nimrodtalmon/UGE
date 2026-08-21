import type { GameDef } from '../../src/shared/plugin.js';
import { pickClaim } from './bot.js';
import { BOARD_MIN, faceUp, hasSet, isSet, makeDeck, settle, shuffle } from './lib.js';
import type { Card } from './lib.js';

/** A wrong call is not free: that player's cards go dead for five seconds. */
const LOCKOUT_MS = 5_000;
/** How long the green/red ring round a claim stays up, for the views. */
export const FLASH_MS = 1_400;

export interface Claim {
  seat: number;
  ok: boolean;
  at: number;
  /** The three cards that were called — shown briefly, then gone. */
  cards: Card[];
}

export interface SetState {
  /** Slots, in fixed positions; null is a gap left by an exhausted deck. */
  board: (Card | null)[];
  deck: Card[];
  names: string[];
  scores: number[];
  misses: number[];
  /** Per seat: server time this player may call again (0 = right now). */
  lockedUntil: number[];
  /** Bumped whenever the face-up cards change — the bots' "fresh table" id. */
  serial: number;
  /** Server time the current table appeared, for bot reaction times. */
  boardAt: number;
  lastClaim: Claim | null;
}

export interface SetView {
  board: (Card | null)[];
  deckLeft: number;
  names: string[];
  scores: number[];
  misses: number[];
  /** This device's seat, or -1 for the table screen and for spectators. */
  myIndex: number;
  /** Server time I may call again — the phone counts it down. */
  myLockedUntil: number;
  lastClaim: Claim | null;
  serial: number;
  /** True only once the deck is out and nothing on the table is a set. */
  finished: boolean;
}

const overOf = (state: SetState): boolean =>
  state.deck.length === 0 && !hasSet(faceUp(state.board));

/** Read three slot numbers off the wire; null for anything malformed. */
function readPicks(raw: unknown, slots: number): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const picks: number[] = [];
  for (const v of raw as unknown[]) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= slots) return null;
    if (picks.includes(v)) return null;
    picks.push(v);
  }
  return [picks[0]!, picks[1]!, picks[2]!];
}

const game: GameDef<SetState, SetView> = {
  setup({ players, random, now, mode }) {
    const wanted = mode.config['deck'];
    // keep the deck a multiple of three: cards only ever leave three at a time
    const size =
      typeof wanted === 'number'
        ? Math.max(BOARD_MIN, Math.min(81, Math.floor(wanted / 3) * 3))
        : 81;
    const dealt = settle(
      Array.from({ length: BOARD_MIN }, () => null),
      shuffle(makeDeck(), random).slice(0, size),
    );
    return {
      board: dealt.board,
      deck: dealt.deck,
      names: players.map((p) => p.name),
      scores: players.map(() => 0),
      misses: players.map(() => 0),
      lockedUntil: players.map(() => 0),
      serial: 0,
      boardAt: now,
      lastClaim: null,
    };
  },

  moves: {
    /**
     * "That's a set!" — three slot numbers. Everyone plays at once, so there
     * is no turn to own; the only ownership check is that the sender holds a
     * seat and is not serving a lockout.
     */
    claim(state, ctx, rawPicks: number[]) {
      if (ctx.role === 'table') return state; // the table is display-only
      if (overOf(state)) return state;
      const seat = ctx.players.findIndex((p) => p.id === ctx.playerId);
      if (seat < 0 || seat >= state.scores.length) return state;
      if (ctx.now < (state.lockedUntil[seat] ?? 0)) return state;

      const picks = readPicks(rawPicks, state.board.length);
      if (picks === null) return state;
      const cards = picks.map((i) => state.board[i]);
      if (cards.some((c) => c === null || c === undefined)) return state;
      const [a, b, c] = cards as [Card, Card, Card];

      if (!isSet(a, b, c)) {
        return {
          ...state,
          misses: state.misses.map((m, i) => (i === seat ? m + 1 : m)),
          lockedUntil: state.lockedUntil.map((t, i) => (i === seat ? ctx.now + LOCKOUT_MS : t)),
          lastClaim: { seat, ok: false, at: ctx.now, cards: [a, b, c] },
        };
      }

      const emptied = state.board.map((card, i) => (picks.includes(i) ? null : card));
      const dealt = settle(emptied, state.deck);
      return {
        ...state,
        board: dealt.board,
        deck: dealt.deck,
        scores: state.scores.map((s, i) => (i === seat ? s + 1 : s)),
        serial: state.serial + 1,
        boardAt: ctx.now,
        lastClaim: { seat, ok: true, at: ctx.now, cards: [a, b, c] },
      };
    },
  },

  /**
   * Nothing here is secret — every player looks at the same twelve cards, and
   * that is the whole game. The per-device part is the lockout: only the seat
   * that called wrong is counting anything down.
   */
  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    return {
      board: state.board,
      deckLeft: state.deck.length,
      names: state.names,
      scores: state.scores,
      misses: state.misses,
      myIndex,
      myLockedUntil: myIndex >= 0 ? (state.lockedUntil[myIndex] ?? 0) : 0,
      lastClaim: state.lastClaim,
      serial: state.serial,
      finished: overOf(state),
    };
  },

  isOver(state) {
    if (!overOf(state)) return null;
    if (state.scores.length === 0) return { text: '🔺 Deck out' };
    const top = Math.max(...state.scores);
    const winners = state.names.filter((_, i) => state.scores[i] === top);
    const sets = top === 1 ? '1 set' : `${top} sets`;
    if (state.scores.length === 1) return { text: `🔺 ${sets} found!` };
    return winners.length === 1
      ? { text: `🔺 ${winners[0]} wins with ${sets}!` }
      : { text: `🔺 Tie — ${winners.join(' & ')} on ${sets}` };
  },

  /**
   * AI opponent — see bot.ts. It reads the same table everybody else does and
   * only ever plays real sets; the difficulty knob is how long it takes to
   * see one, and how many it overlooks.
   */
  bot(state, { seat, level, now }) {
    if (overOf(state)) return null;
    if (seat < 0 || seat >= state.scores.length) return null;
    if (now < (state.lockedUntil[seat] ?? 0)) return null;
    const picks = pickClaim(
      state.board,
      state.serial,
      seat,
      state.scores.length,
      level,
      now - state.boardAt,
    );
    return picks ? { name: 'claim', args: [picks] } : null;
  },
};

export default game;
