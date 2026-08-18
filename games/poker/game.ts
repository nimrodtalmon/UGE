import type { GameDef } from '../../src/shared/plugin.js';
import {
  buildDeck,
  cmpEval,
  distributePots,
  evaluate7,
  HAND_NAMES,
  type PCard,
} from './engine.js';

const START_CHIPS = 1000;
const BB = 20;
const HANDOVER_MS = 7000;

export type Stage = 'preflop' | 'flop' | 'turn' | 'river' | 'handover';

interface Seat {
  chips: number;
  hole: PCard[];
  folded: boolean;
  allIn: boolean;
  out: boolean; // busted — sits out permanently
  streetBet: number;
  totalBet: number;
  acted: boolean;
}

export interface PokerState {
  seats: Seat[];
  names: string[];
  dealer: number;
  stage: Stage;
  board: PCard[];
  deck: PCard[];
  currentBet: number;
  minRaise: number;
  toAct: number;
  handResult: string | null;
  showdown: boolean; // reveal non-folded holes during handover
  endsAt: number;
  winner: number | null;
}

export interface PokerSeatView {
  chips: number;
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  out: boolean;
  dealt: boolean;
  hole: PCard[] | null; // own cards, or everyone's at showdown
}

export interface PokerView {
  stage: Stage;
  board: PCard[];
  pot: number;
  seats: PokerSeatView[];
  names: string[];
  myIndex: number;
  toAct: number;
  dealer: number;
  currentBet: number;
  minRaise: number;
  bb: number;
  callAmount: number;
  handResult: string | null;
  endsAt: number;
  winner: number | null;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const clone = (s: PokerState): PokerState => ({
  ...s,
  seats: s.seats.map((p) => ({ ...p, hole: [...p.hole] })),
  board: [...s.board],
  deck: [...s.deck],
});

const alive = (s: PokerState) => s.seats.flatMap((p, i) => (!p.out ? [i] : []));
const nextFrom = (s: PokerState, i: number, ok: (seat: Seat) => boolean): number => {
  const n = s.seats.length;
  for (let step = 1; step <= n; step++) {
    const j = (i + step) % n;
    if (!s.seats[j]!.out && ok(s.seats[j]!)) return j;
  }
  return -1;
};
const inHand = (p: Seat) => !p.out && p.hole.length > 0 && !p.folded;
const canAct = (p: Seat) => inHand(p) && !p.allIn;

function pay(p: Seat, amount: number): number {
  const paid = Math.min(amount, p.chips);
  p.chips -= paid;
  p.streetBet += paid;
  p.totalBet += paid;
  if (p.chips === 0) p.allIn = true;
  return paid;
}

function startHand(s: PokerState, random: () => number, now: number): PokerState {
  const live = alive(s);
  if (live.length < 2) {
    return { ...s, winner: live[0] ?? null, handResult: null };
  }
  for (const p of s.seats) {
    p.hole = [];
    p.folded = false;
    p.allIn = false;
    p.streetBet = 0;
    p.totalBet = 0;
    p.acted = false;
  }
  s.dealer = nextFrom(s, s.dealer, () => true);
  const headsUp = live.length === 2;
  const sb = headsUp ? s.dealer : nextFrom(s, s.dealer, () => true);
  const bb = nextFrom(s, sb, () => true);
  pay(s.seats[sb]!, BB / 2);
  pay(s.seats[bb]!, BB);
  s.deck = shuffle(buildDeck(), random);
  for (const i of live) s.seats[i]!.hole = s.deck.splice(0, 2);
  s.board = [];
  s.stage = 'preflop';
  s.currentBet = BB;
  s.minRaise = BB;
  s.handResult = null;
  s.showdown = false;
  s.toAct = nextFrom(s, bb, canAct);
  if (s.toAct === -1) return runOut(s, now); // everyone forced all-in by blinds
  return s;
}

function finishByFolds(s: PokerState, winnerSeat: number, now: number): PokerState {
  const contrib = s.seats.map((p) => p.totalBet);
  const gains = distributePots(contrib, [winnerSeat], () => [0]);
  gains.forEach((g, i) => (s.seats[i]!.chips += g));
  s.handResult = `${s.names[winnerSeat]} takes ${gains[winnerSeat]} — everyone folded`;
  s.showdown = false;
  return toHandover(s, now);
}

function runOut(s: PokerState, now: number): PokerState {
  while (s.board.length < 5) s.board.push(s.deck.pop()!);
  return showdown(s, now);
}

function showdown(s: PokerState, now: number): PokerState {
  const contenders = s.seats.flatMap((p, i) => (inHand(p) ? [i] : []));
  const scores = new Map(contenders.map((i) => [i, evaluate7([...s.seats[i]!.hole, ...s.board])]));
  const gains = distributePots(
    s.seats.map((p) => p.totalBet),
    contenders,
    (i) => scores.get(i)!,
  );
  gains.forEach((g, i) => (s.seats[i]!.chips += g));
  let best = contenders[0]!;
  for (const i of contenders) if (cmpEval(scores.get(i)!, scores.get(best)!) > 0) best = i;
  const winners = contenders.filter((i) => cmpEval(scores.get(i)!, scores.get(best)!) === 0);
  const handName = HAND_NAMES[scores.get(best)![0]!]!;
  s.handResult =
    winners.length === 1
      ? `${s.names[best]} wins ${gains[best]} with ${handName}`
      : `split pot — ${winners.map((i) => s.names[i]).join(' & ')} with ${handName}`;
  s.showdown = true;
  return toHandover(s, now);
}

function toHandover(s: PokerState, now: number): PokerState {
  s.stage = 'handover';
  s.toAct = -1;
  s.endsAt = now + HANDOVER_MS;
  return s;
}

/** After each action: fold-win, next actor, next street, or showdown. */
function advance(s: PokerState, now: number): PokerState {
  const contenders = s.seats.flatMap((p, i) => (inHand(p) ? [i] : []));
  if (contenders.length === 1) return finishByFolds(s, contenders[0]!, now);

  const pending = s.seats.some((p) => canAct(p) && (!p.acted || p.streetBet < s.currentBet));
  if (pending) {
    s.toAct = nextFrom(s, s.toAct, (p) => canAct(p) && (!p.acted || p.streetBet < s.currentBet));
    return s;
  }

  // street complete
  if (s.stage === 'river') return showdown(s, now);
  const actors = s.seats.filter((p) => canAct(p)).length;
  if (actors <= 1) return runOut(s, now); // everyone (or all but one) is all-in

  for (const p of s.seats) {
    p.streetBet = 0;
    p.acted = false;
  }
  s.currentBet = 0;
  s.minRaise = BB;
  s.stage = s.stage === 'preflop' ? 'flop' : s.stage === 'flop' ? 'turn' : 'river';
  s.board.push(...s.deck.splice(0, s.stage === 'flop' ? 3 : 1));
  s.toAct = nextFrom(s, s.dealer, canAct);
  return s;
}

function actorIndex(s: PokerState, ctx: { playerId: string; players: { id: string }[] }): number {
  const me = ctx.players.findIndex((p) => p.id === ctx.playerId);
  return me >= 0 && me === s.toAct && s.stage !== 'handover' && s.winner === null ? me : -1;
}

const game: GameDef<PokerState, PokerView> = {
  setup({ players, random, now }) {
    const s: PokerState = {
      seats: players.map(() => ({
        chips: START_CHIPS,
        hole: [],
        folded: false,
        allIn: false,
        out: false,
        streetBet: 0,
        totalBet: 0,
        acted: false,
      })),
      names: players.map((p) => p.name),
      dealer: players.length - 1, // startHand advances to seat 0
      stage: 'handover',
      board: [],
      deck: [],
      currentBet: 0,
      minRaise: BB,
      toAct: -1,
      handResult: null,
      showdown: false,
      endsAt: 0,
      winner: null,
    };
    return startHand(s, random, now);
  },

  moves: {
    fold(state, ctx) {
      const me = actorIndex(state, ctx);
      if (me < 0) return state;
      const s = clone(state);
      s.seats[me]!.folded = true;
      s.seats[me]!.acted = true;
      return advance(s, ctx.now);
    },

    /** Check when unraised, call otherwise. */
    call(state, ctx) {
      const me = actorIndex(state, ctx);
      if (me < 0) return state;
      const s = clone(state);
      const p = s.seats[me]!;
      pay(p, s.currentBet - p.streetBet);
      p.acted = true;
      return advance(s, ctx.now);
    },

    /** Raise the street bet TO `to` chips (all-in below min-raise is allowed). */
    raise(state, ctx, to: number) {
      const me = actorIndex(state, ctx);
      if (me < 0 || !Number.isInteger(to)) return state;
      const s = clone(state);
      const p = s.seats[me]!;
      const maxTo = p.streetBet + p.chips;
      if (to <= s.currentBet || to > maxTo) return state;
      if (to < s.currentBet + s.minRaise && to !== maxTo) return state;
      pay(p, to - p.streetBet);
      p.acted = true;
      if (to > s.currentBet) {
        s.minRaise = Math.max(s.minRaise, to - s.currentBet);
        s.currentBet = to;
        for (const q of s.seats) if (q !== p && canAct(q)) q.acted = false;
      }
      return advance(s, ctx.now);
    },

    /** Handover timer (sent by the table; idempotent) — start the next hand. */
    nextHand(state, ctx) {
      if (state.stage !== 'handover' || state.winner !== null) return state;
      if (ctx.now < state.endsAt - 250) return state;
      const s = clone(state);
      for (const p of s.seats) if (p.chips === 0) p.out = true;
      return startHand(s, ctx.random, ctx.now);
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    return {
      stage: state.stage,
      board: state.board,
      pot: state.seats.reduce((sum, p) => sum + p.totalBet, 0),
      seats: state.seats.map((p, i) => ({
        chips: p.chips,
        streetBet: p.streetBet,
        folded: p.folded,
        allIn: p.allIn,
        out: p.out,
        dealt: p.hole.length > 0,
        hole:
          i === myIndex || (state.showdown && state.stage === 'handover' && inHand(p))
            ? p.hole
            : null,
      })),
      names: state.names,
      myIndex,
      toAct: state.toAct,
      dealer: state.dealer,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      bb: BB,
      callAmount:
        myIndex >= 0 && state.seats[myIndex]
          ? Math.min(
              state.currentBet - state.seats[myIndex].streetBet,
              state.seats[myIndex].chips,
            )
          : 0,
      handResult: state.handResult,
      endsAt: state.endsAt,
      winner: state.winner,
    };
  },

  isOver(state) {
    return state.winner !== null
      ? { text: `${state.names[state.winner]} takes all the chips! 🏆` }
      : null;
  },
};

export default game;
