import type { GameDef } from '../../src/shared/plugin.js';
import { decide } from './bot.js';

const START_DICE = 5;
const REVEAL_MS = 8_000;

export type Phase = 'bidding' | 'reveal';

export interface Bid {
  quantity: number;
  face: number; // 2..6 — ones are wild, never bid on
}

interface Seat {
  dice: number[]; // this round's hidden roll; length = dice remaining
  out: boolean;
}

export interface LdState {
  seats: Seat[];
  names: string[];
  phase: Phase;
  /** Seat to act during bidding; meaningless during reveal. */
  turn: number;
  bid: Bid | null;
  /** Seat that made the current bid (-1 before the round's first bid). */
  bidder: number;
  roundStarter: number;
  /** Reveal info — set by dudo, cleared when the next round starts. */
  challenger: number;
  tally: number; // dice matching the bid face (wild 1s included)
  loser: number;
  endsAt: number;
  winner: number | null;
}

export interface LdSeatView {
  count: number;
  out: boolean;
  /** Own dice during bidding; everyone's during reveal; null otherwise. */
  dice: number[] | null;
}

export interface LdView {
  phase: Phase;
  seats: LdSeatView[];
  names: string[];
  myIndex: number;
  turn: number;
  bid: Bid | null;
  bidder: number;
  totalDice: number;
  challenger: number;
  tally: number;
  loser: number;
  endsAt: number;
  winner: number | null;
}

const clone = (s: LdState): LdState => ({
  ...s,
  seats: s.seats.map((p) => ({ ...p, dice: [...p.dice] })),
  bid: s.bid ? { ...s.bid } : null,
});

const living = (s: LdState) => s.seats.flatMap((p, i) => (!p.out ? [i] : []));

function nextLivingFrom(s: LdState, i: number): number {
  const n = s.seats.length;
  for (let step = 1; step <= n; step++) {
    const j = (i + step) % n;
    if (!s.seats[j]!.out) return j;
  }
  return i;
}

const totalDice = (s: LdState) => s.seats.reduce((sum, p) => sum + p.dice.length, 0);

const rollDie = (random: () => number) => 1 + Math.floor(random() * 6);

/** Roll every living player's dice and open the bidding at roundStarter. */
function startRound(s: LdState, random: () => number): LdState {
  for (const p of s.seats) {
    p.dice = p.dice.map(() => rollDie(random));
  }
  s.phase = 'bidding';
  s.turn = s.roundStarter;
  s.bid = null;
  s.bidder = -1;
  s.challenger = -1;
  s.tally = 0;
  s.loser = -1;
  s.endsAt = 0;
  return s;
}

/** The sender's seat, iff it's their turn to bid — else -1. */
function actorIndex(s: LdState, ctx: { playerId: string; players: { id: string }[] }): number {
  const me = ctx.players.findIndex((p) => p.id === ctx.playerId);
  return me >= 0 && me === s.turn && s.phase === 'bidding' && s.winner === null && !s.seats[me]!.out
    ? me
    : -1;
}

const beats = (bid: Bid | null, quantity: number, face: number): boolean =>
  bid === null || quantity > bid.quantity || (quantity === bid.quantity && face > bid.face);

const game: GameDef<LdState, LdView> = {
  setup({ players, random }) {
    const s: LdState = {
      seats: players.map(() => ({ dice: Array.from({ length: START_DICE }, () => 0), out: false })),
      names: players.map((p) => p.name),
      phase: 'bidding',
      turn: 0,
      bid: null,
      bidder: -1,
      roundStarter: 0,
      challenger: -1,
      tally: 0,
      loser: -1,
      endsAt: 0,
      winner: null,
    };
    return startRound(s, random);
  },

  moves: {
    /** Raise the bid: `quantity` dice showing `face` (2..6). Must beat the current bid. */
    bid(state, ctx, quantity: number, face: number) {
      const me = actorIndex(state, ctx);
      if (me < 0) return state;
      if (!Number.isInteger(quantity) || !Number.isInteger(face)) return state;
      if (face < 2 || face > 6) return state;
      if (quantity < 1 || quantity > totalDice(state)) return state;
      if (!beats(state.bid, quantity, face)) return state;
      const s = clone(state);
      s.bid = { quantity, face };
      s.bidder = me;
      s.turn = nextLivingFrom(s, me);
      return s;
    },

    /** Call the bluff — reveal all dice and settle the current bid (1s are wild). */
    dudo(state, ctx) {
      const me = actorIndex(state, ctx);
      if (me < 0 || state.bid === null) return state;
      const s = clone(state);
      const bid = s.bid!;
      s.challenger = me;
      s.tally = s.seats.reduce(
        (sum, p) => sum + p.dice.filter((d) => d === bid.face || d === 1).length,
        0,
      );
      // enough dice → the bid stands and the challenger pays; short → the bidder pays
      s.loser = s.tally >= bid.quantity ? me : s.bidder;
      s.phase = 'reveal';
      s.endsAt = ctx.now + REVEAL_MS;
      return s;
    },

    /** Reveal timer (driven by the table, backed up by phones; idempotent). */
    nextRound(state, ctx) {
      if (state.phase !== 'reveal' || state.winner !== null) return state;
      if (ctx.now < state.endsAt - 250) return state;
      const s = clone(state);
      const loser = s.seats[s.loser]!;
      loser.dice.pop();
      if (loser.dice.length === 0) loser.out = true;
      const alive = living(s);
      if (alive.length === 1) {
        s.winner = alive[0]!;
        return s;
      }
      s.roundStarter = loser.out ? nextLivingFrom(s, s.loser) : s.loser;
      return startRound(s, ctx.random);
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    const reveal = state.phase === 'reveal';
    return {
      phase: state.phase,
      seats: state.seats.map((p, i) => ({
        count: p.dice.length,
        out: p.out,
        dice: reveal || i === myIndex ? p.dice : null,
      })),
      names: state.names,
      myIndex,
      turn: state.turn,
      bid: state.bid,
      bidder: state.bidder,
      totalDice: totalDice(state),
      challenger: state.challenger,
      tally: state.tally,
      loser: state.loser,
      endsAt: state.endsAt,
      winner: state.winner,
    };
  },

  isOver(state) {
    return state.winner !== null
      ? { text: `${state.names[state.winner]} out-bluffs everyone! 🎲` }
      : null;
  },

  /**
   * AI opponent — see bot.ts. It weighs the bid against its OWN cup and the
   * public dice counts; the other cups are in the state and stay unread, so it
   * is bluffing on the same information a person has. The reveal is left to the
   * clients' timer.
   */
  bot(state, { seat, level, random }) {
    if (state.winner !== null || state.phase !== 'bidding' || state.turn !== seat) return null;
    const me = state.seats[seat];
    if (!me || me.out) return null;
    // the bidder's dice COUNT is public — their faces are not, and stay unread
    const bidderDice = state.bidder >= 0 && state.bidder !== seat
      ? (state.seats[state.bidder]?.dice.length ?? 0)
      : 0;
    const action = decide(state.bid, me.dice, totalDice(state), bidderDice, level, random);
    if (action.kind === 'bid') return { name: 'bid', args: [action.quantity, action.face] };
    return state.bid === null ? null : { name: 'dudo' };
  },
};

export default game;
