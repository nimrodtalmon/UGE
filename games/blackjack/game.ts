import type { GameDef } from '../../src/shared/plugin.js';
import { chooseAction, chooseBet, type SeenTable } from './bot.js';
import {
  buildShoe,
  countTag,
  isNatural,
  shuffle,
  total,
  type BCard,
} from './cards.js';

const START_CHIPS = 500;
const MIN_BET = 10;
const DECKS = 4;
/** Shuffle a fresh shoe when it gets this thin — and everybody sees it happen. */
const RESHUFFLE_AT = 60;
const BET_MS = 30_000;
const DEALER_MS = 900;
const PAYOUT_MS = 5000;

export type Phase = 'bets' | 'play' | 'dealer' | 'payout';
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | null;

export interface BjHand {
  cards: BCard[];
  bet: number;
  doubled: boolean;
  /** Stood, busted, doubled out, or sitting on 21 — no more decisions. */
  done: boolean;
  bust: boolean;
  natural: boolean;
  outcome: Outcome;
  /** Chips handed back at settlement (0 on a loss, the stake on a push). */
  won: number;
}

export interface BjSeat {
  chips: number;
  hands: BjHand[];
  /** Which of this seat's hands is being played. */
  active: number;
  /** The stake for the coming round (locked in by `ready`). */
  bet: number;
  ready: boolean;
  net: number;
  broke: boolean;
}

export interface BjState {
  seats: BjSeat[];
  names: string[];
  /** Undealt cards. NEVER leaves the server. */
  shoe: BCard[];
  /** [0] is the up card; [1] is the hole card, secret until the dealer phase. */
  dealer: BCard[];
  phase: Phase;
  turn: number;
  round: number;
  /** 0 = play until the chips run out. */
  maxRounds: number;
  endsAt: number;
  finished: boolean;
  roundText: string | null;
  resultText: string | null;
  /**
   * Hi-Lo running count over cards that have been turned FACE UP in front of
   * everyone. The hole card joins it when the dealer turns it over, not before.
   */
  seenCount: number;
}

export interface BjHandView {
  cards: BCard[];
  bet: number;
  value: number;
  soft: boolean;
  bust: boolean;
  natural: boolean;
  done: boolean;
  doubled: boolean;
  outcome: Outcome;
  won: number;
}

export interface BjSeatView {
  name: string;
  chips: number;
  bet: number;
  ready: boolean;
  broke: boolean;
  net: number;
  hands: BjHandView[];
  active: number;
}

export interface BjView {
  phase: Phase;
  round: number;
  maxRounds: number;
  turn: number;
  myIndex: number;
  seats: BjSeatView[];
  /** The hole card is simply absent until the dealer turns it over. */
  dealer: { cards: BCard[]; hidden: boolean; value: number; soft: boolean; bust: boolean; natural: boolean };
  /** Which buttons this device may show — computed for its own active hand. */
  can: { hit: boolean; stand: boolean; double: boolean; split: boolean };
  minBet: number;
  shoeLeft: number;
  endsAt: number;
  roundText: string | null;
  resultText: string | null;
  finished: boolean;
}

const clone = (s: BjState): BjState => ({
  ...s,
  seats: s.seats.map((p) => ({ ...p, hands: p.hands.map((h) => ({ ...h, cards: [...h.cards] })) })),
  shoe: [...s.shoe],
  dealer: [...s.dealer],
});

const newHand = (bet: number): BjHand => ({
  cards: [],
  bet,
  doubled: false,
  done: false,
  bust: false,
  natural: false,
  outcome: null,
  won: 0,
});

const seatOf = (ctx: { playerId: string; players: { id: string }[] }): number =>
  ctx.players.findIndex((p) => p.id === ctx.playerId);

function draw(s: BjState, random: () => number): BCard {
  if (s.shoe.length === 0) {
    s.shoe = shuffle(buildShoe(DECKS), random);
    s.seenCount = 0;
  }
  return s.shoe.pop()!;
}

/** Turn a card face up: it lands in the hand AND in the running count. */
function dealUp(s: BjState, into: BCard[], random: () => number): void {
  const card = draw(s, random);
  into.push(card);
  s.seenCount += countTag(card.r);
}

/** The dealer's hole card: dealt face down, counted only when it is turned. */
function dealHole(s: BjState, random: () => number): void {
  s.dealer.push(draw(s, random));
}

function revealHole(s: BjState): void {
  const hole = s.dealer[1];
  if (hole) s.seenCount += countTag(hole.r);
}

const liveHands = (s: BjState): BjHand[] => s.seats.flatMap((p) => p.hands.filter((h) => !h.bust));

function finish(s: BjState): BjState {
  s.finished = true;
  s.phase = 'payout';
  s.turn = -1;
  if (s.seats.length === 1) {
    const chips = s.seats[0]!.chips;
    const delta = chips - START_CHIPS;
    s.resultText =
      chips === 0
        ? 'Busted out — the house keeps the lot 🏚️'
        : `You walk away with ${chips} chips (${delta >= 0 ? '+' : ''}${delta}) 💰`;
    return s;
  }
  const best = Math.max(...s.seats.map((p) => p.chips));
  const winners = s.seats.flatMap((p, i) => (p.chips === best ? [i] : []));
  const board = s.seats.map((p, i) => `${s.names[i]} ${p.chips}`).join(', ');
  s.resultText =
    best === 0
      ? `Everyone busted out — the house takes it all 🏚️ (${board})`
      : winners.length === 1
        ? `${s.names[winners[0]!]} leaves with ${best} chips 💰 (${board})`
        : `${winners.map((i) => s.names[i]).join(' & ')} tie on ${best} chips (${board})`;
  return s;
}

/** Open the betting for a fresh round. */
function openBets(s: BjState, random: () => number, now: number): BjState {
  if (s.shoe.length < RESHUFFLE_AT) {
    s.shoe = shuffle(buildShoe(DECKS), random);
    s.seenCount = 0; // a fresh shoe: everything anyone counted is void
  }
  s.dealer = [];
  for (const p of s.seats) {
    p.hands = [];
    p.active = 0;
    p.net = 0;
    p.broke = p.chips <= 0;
    p.ready = false;
    p.bet = Math.max(Math.min(p.bet || MIN_BET, p.chips), Math.min(MIN_BET, p.chips));
  }
  s.phase = 'bets';
  s.turn = -1;
  s.roundText = null;
  s.endsAt = now + BET_MS;
  return s;
}

function firstToAct(s: BjState): number {
  for (let i = 0; i < s.seats.length; i++) {
    const idx = s.seats[i]!.hands.findIndex((h) => !h.done);
    if (idx >= 0) {
      s.seats[i]!.active = idx;
      return i;
    }
  }
  return -1;
}

function toDealer(s: BjState, now: number): BjState {
  s.phase = 'dealer';
  s.turn = -1;
  revealHole(s); // the tension resolves here, and not one poll earlier
  s.endsAt = now + DEALER_MS;
  return s;
}

/** Bets are in: take the stakes and deal two cards each, dealer last. */
function deal(s: BjState, random: () => number, now: number): BjState {
  const playing = s.seats.flatMap((p, i) => (p.ready && p.bet > 0 && p.chips >= p.bet ? [i] : []));
  if (playing.length === 0) return finish(s);
  for (const i of playing) {
    const p = s.seats[i]!;
    p.chips -= p.bet;
    p.hands = [newHand(p.bet)];
  }
  for (const i of playing) dealUp(s, s.seats[i]!.hands[0]!.cards, random);
  dealUp(s, s.dealer, random); // the up card
  for (const i of playing) dealUp(s, s.seats[i]!.hands[0]!.cards, random);
  dealHole(s, random); // face down — nobody sees this one yet
  for (const i of playing) {
    const h = s.seats[i]!.hands[0]!;
    if (isNatural(h.cards)) {
      h.natural = true;
      h.done = true;
    }
  }
  s.phase = 'play';
  s.endsAt = 0; // no clock on a player's decision
  s.turn = firstToAct(s);
  return s.turn < 0 ? toDealer(s, now) : s;
}

/** After an action: next hand of this seat, next seat, or the dealer's turn. */
function advance(s: BjState, now: number): BjState {
  const seat = s.seats[s.turn];
  if (seat) {
    const next = seat.hands.findIndex((h, i) => i > seat.active && !h.done);
    if (next >= 0) {
      seat.active = next;
      return s;
    }
  }
  for (let i = s.turn + 1; i < s.seats.length; i++) {
    const idx = s.seats[i]!.hands.findIndex((h) => !h.done);
    if (idx >= 0) {
      s.turn = i;
      s.seats[i]!.active = idx;
      return s;
    }
  }
  return toDealer(s, now);
}

/** Mark a hand finished if it can no longer act, then move play along. */
function afterAction(s: BjState, h: BjHand, now: number): BjState {
  const t = total(h.cards);
  if (t.value > 21) {
    h.bust = true;
    h.done = true;
  } else if (t.value === 21) {
    h.done = true;
  }
  return h.done ? advance(s, now) : s;
}

function settle(s: BjState, now: number): BjState {
  const dealerTotal = total(s.dealer).value;
  const dealerBust = dealerTotal > 21;
  const dealerBJ = isNatural(s.dealer);
  for (const p of s.seats) {
    let staked = 0;
    let back = 0;
    for (const h of p.hands) {
      staked += h.bet;
      if (h.bust) h.outcome = 'lose';
      else if (h.natural) h.outcome = dealerBJ ? 'push' : 'blackjack';
      else if (dealerBJ) h.outcome = 'lose';
      else if (dealerBust) h.outcome = 'win';
      else {
        const mine = total(h.cards).value;
        h.outcome = mine > dealerTotal ? 'win' : mine === dealerTotal ? 'push' : 'lose';
      }
      h.won =
        h.outcome === 'blackjack'
          ? h.bet + Math.floor((h.bet * 3) / 2) // 3:2
          : h.outcome === 'win'
            ? h.bet * 2
            : h.outcome === 'push'
              ? h.bet
              : 0;
      back += h.won;
    }
    p.chips += back;
    p.net = back - staked;
  }
  const dealerLine = s.dealer.length === 0
    ? 'no hand'
    : dealerBust
      ? `Dealer busts with ${dealerTotal}`
      : dealerBJ
        ? 'Dealer has blackjack'
        : `Dealer stands on ${dealerTotal}`;
  const players = s.seats
    .flatMap((p, i) => (p.hands.length > 0 ? [`${s.names[i]} ${p.net >= 0 ? '+' : ''}${p.net}`] : []))
    .join(', ');
  s.roundText = players ? `${dealerLine} — ${players}` : dealerLine;
  s.phase = 'payout';
  s.turn = -1;
  s.endsAt = now + PAYOUT_MS;
  return s;
}

const game: GameDef<BjState, BjView> = {
  setup({ players, random, now, mode }) {
    const rounds = mode.config['rounds'];
    const s: BjState = {
      seats: players.map(() => ({
        chips: START_CHIPS,
        hands: [],
        active: 0,
        bet: MIN_BET * 2,
        ready: false,
        net: 0,
        broke: false,
      })),
      names: players.map((p) => p.name),
      shoe: shuffle(buildShoe(DECKS), random),
      dealer: [],
      phase: 'bets',
      turn: -1,
      round: 1,
      maxRounds: typeof rounds === 'number' && rounds > 0 ? Math.floor(rounds) : 0,
      endsAt: now + BET_MS,
      finished: false,
      roundText: null,
      resultText: null,
      seenCount: 0,
    };
    return s;
  },

  moves: {
    /** Lock this seat's stake in. Betting closes when everyone has. */
    bet(state, ctx, amount: number) {
      if (state.finished || state.phase !== 'bets') return state;
      const me = seatOf(ctx);
      if (me < 0) return state;
      const seat = state.seats[me]!;
      if (seat.ready || seat.chips <= 0) return state;
      if (!Number.isInteger(amount)) return state;
      const min = Math.min(MIN_BET, seat.chips);
      if (amount < min || amount > seat.chips) return state;
      const s = clone(state);
      s.seats[me]!.bet = amount;
      s.seats[me]!.ready = true;
      const waiting = s.seats.some((p) => p.chips > 0 && !p.ready);
      return waiting ? s : deal(s, ctx.random, ctx.now);
    },

    /** Betting-clock expiry (client-driven, idempotent): deal with what's in. */
    closeBets(state, ctx) {
      if (state.finished || state.phase !== 'bets') return state;
      if (ctx.now < state.endsAt - 250) return state;
      const s = clone(state);
      for (const p of s.seats) {
        if (p.chips <= 0 || p.ready) continue;
        p.bet = Math.max(Math.min(p.bet, p.chips), Math.min(MIN_BET, p.chips));
        p.ready = true;
      }
      return deal(s, ctx.random, ctx.now);
    },

    hit(state, ctx) {
      if (state.finished || state.phase !== 'play') return state;
      const me = seatOf(ctx);
      if (me < 0 || me !== state.turn) return state;
      const s = clone(state);
      const h = s.seats[me]!.hands[s.seats[me]!.active];
      if (!h || h.done) return state;
      dealUp(s, h.cards, ctx.random);
      return afterAction(s, h, ctx.now);
    },

    stand(state, ctx) {
      if (state.finished || state.phase !== 'play') return state;
      const me = seatOf(ctx);
      if (me < 0 || me !== state.turn) return state;
      const s = clone(state);
      const h = s.seats[me]!.hands[s.seats[me]!.active];
      if (!h || h.done) return state;
      h.done = true;
      return advance(s, ctx.now);
    },

    /** Double the stake, take exactly one more card, and that hand is done. */
    double(state, ctx) {
      if (state.finished || state.phase !== 'play') return state;
      const me = seatOf(ctx);
      if (me < 0 || me !== state.turn) return state;
      const s = clone(state);
      const seat = s.seats[me]!;
      const h = seat.hands[seat.active];
      if (!h || h.done || h.doubled || h.cards.length !== 2) return state;
      if (seat.chips < h.bet) return state;
      seat.chips -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      dealUp(s, h.cards, ctx.random);
      h.done = true;
      const t = total(h.cards);
      if (t.value > 21) h.bust = true;
      return advance(s, ctx.now);
    },

    /** Split a matching pair into two hands (once — two hands is the limit). */
    split(state, ctx) {
      if (state.finished || state.phase !== 'play') return state;
      const me = seatOf(ctx);
      if (me < 0 || me !== state.turn) return state;
      const s = clone(state);
      const seat = s.seats[me]!;
      if (seat.hands.length !== 1) return state; // two hands is the cap
      const h = seat.hands[0]!;
      if (h.done || h.doubled || h.cards.length !== 2) return state;
      const [a, b] = h.cards;
      if (!a || !b || a.r !== b.r) return state;
      if (seat.chips < h.bet) return state;
      seat.chips -= h.bet;
      const first = newHand(h.bet);
      const second = newHand(h.bet);
      first.cards = [a];
      second.cards = [b];
      seat.hands = [first, second];
      seat.active = 0;
      dealUp(s, first.cards, ctx.random);
      dealUp(s, second.cards, ctx.random);
      // 21 on a split hand is 21, never a blackjack
      for (const hand of seat.hands) if (total(hand.cards).value === 21) hand.done = true;
      return first.done ? advance(s, ctx.now) : s;
    },

    /** Dealer-draw tick (client-driven, idempotent): one card per beat. */
    dealerStep(state, ctx) {
      if (state.finished || state.phase !== 'dealer') return state;
      if (ctx.now < state.endsAt - 250) return state;
      const s = clone(state);
      const t = total(s.dealer);
      // the house draws to 16 and stands on all 17s — and does not bother
      // drawing at all when every player has already busted
      if (liveHands(s).length > 0 && t.value < 17) {
        dealUp(s, s.dealer, ctx.random);
        s.endsAt = ctx.now + DEALER_MS;
        return total(s.dealer).value > 21 ? settle(s, ctx.now) : s;
      }
      return settle(s, ctx.now);
    },

    /** Payout-reveal expiry (client-driven, idempotent): next round, or stop. */
    nextRound(state, ctx) {
      if (state.finished || state.phase !== 'payout') return state;
      if (ctx.now < state.endsAt - 250) return state;
      const s = clone(state);
      if (s.seats.every((p) => p.chips <= 0)) return finish(s);
      if (s.maxRounds > 0 && s.round >= s.maxRounds) return finish(s);
      s.round += 1;
      return openBets(s, ctx.random, ctx.now);
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    const revealed = state.phase === 'dealer' || state.phase === 'payout';
    // Player cards are face up on a blackjack table — the one secret in this
    // game is the hole card, so it is SLICED OFF here (not flagged, not sent)
    // until the dealer turns it over, and the shoe never leaves the server.
    const dealerCards = revealed ? state.dealer : state.dealer.slice(0, 1);
    const dealerTotal = total(dealerCards);
    const mySeat = myIndex >= 0 ? state.seats[myIndex] : undefined;
    const myHand = mySeat?.hands[mySeat.active];
    const myTurn = myIndex >= 0 && state.turn === myIndex && state.phase === 'play';
    const actable = myTurn && myHand !== undefined && !myHand.done;
    return {
      phase: state.phase,
      round: state.round,
      maxRounds: state.maxRounds,
      turn: state.turn,
      myIndex,
      seats: state.seats.map((p, i) => ({
        name: state.names[i] ?? '?',
        chips: p.chips,
        bet: p.bet,
        ready: p.ready,
        broke: p.broke,
        net: p.net,
        active: p.active,
        hands: p.hands.map((h) => {
          const t = total(h.cards);
          return {
            cards: h.cards,
            bet: h.bet,
            value: t.value,
            soft: t.soft,
            bust: h.bust,
            natural: h.natural,
            done: h.done,
            doubled: h.doubled,
            outcome: h.outcome,
            won: h.won,
          };
        }),
      })),
      dealer: {
        cards: dealerCards,
        hidden: !revealed && state.dealer.length > 1,
        value: dealerTotal.value,
        soft: dealerTotal.soft,
        bust: revealed && dealerTotal.value > 21,
        natural: revealed && isNatural(state.dealer),
      },
      can: {
        hit: actable,
        stand: actable,
        double: Boolean(
          actable && myHand && myHand.cards.length === 2 && !myHand.doubled && mySeat!.chips >= myHand.bet,
        ),
        split: Boolean(
          actable &&
            myHand &&
            mySeat!.hands.length === 1 &&
            myHand.cards.length === 2 &&
            myHand.cards[0]!.r === myHand.cards[1]!.r &&
            mySeat!.chips >= myHand.bet,
        ),
      },
      minBet: MIN_BET,
      shoeLeft: state.shoe.length,
      endsAt: state.endsAt,
      roundText: state.roundText,
      resultText: state.resultText,
      finished: state.finished,
    };
  },

  isOver(state) {
    return state.finished ? { text: state.resultText ?? 'game over' } : null;
  },

  /**
   * AI opponent — see bot.ts. Everything handed over is something this seat can
   * see from its chair: its own cards and chips, the dealer's UP card (the hole
   * card is deliberately not read here), and a running count over cards already
   * turned face up. The shoe's order and contents never reach it.
   */
  bot(state, { seat, level, random }) {
    if (state.finished) return null;
    const me = state.seats[seat];
    if (!me) return null;

    if (state.phase === 'bets') {
      if (me.ready || me.chips <= 0) return null;
      const table: SeenTable = {
        runningCount: state.seenCount,
        cardsLeft: state.shoe.length,
      };
      return { name: 'bet', args: [chooseBet(me.chips, MIN_BET, level, table)] };
    }

    if (state.phase !== 'play' || state.turn !== seat) return null; // timers are the clients' job
    const hand = me.hands[me.active];
    const up = state.dealer[0];
    if (!hand || hand.done || !up) return null;
    return {
      name: chooseAction({
        cards: hand.cards,
        dealerUp: up,
        canDouble: hand.cards.length === 2 && !hand.doubled && me.chips >= hand.bet,
        canSplit:
          me.hands.length === 1 &&
          hand.cards.length === 2 &&
          hand.cards[0]!.r === hand.cards[1]!.r &&
          me.chips >= hand.bet,
        level,
        random,
      }),
    };
  },
};

export default game;
