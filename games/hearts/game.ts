import type { GameDef, MoveCtx } from '../../src/shared/plugin.js';

const TRICK_END_MS = 2_800;
const HANDOVER_MS = 8_000;
const LOSING_SCORE = 100;
const MOON_POINTS = 26;

export type Phase = 'passing' | 'play' | 'trickEnd' | 'handover';
export type PassDir = 'left' | 'right' | 'across' | 'none';

export interface HCard {
  r: number; // 2..14 (14 = ace)
  s: number; // 0 ♠ · 1 ♥ · 2 ♦ · 3 ♣
}

export const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankLabel = (r: number) => RANKS[r] ?? String(r);

/** Rotates by hand number; recipient seat = (me + offset) % 4. */
const PASS_DIRS: PassDir[] = ['left', 'right', 'across', 'none'];
const PASS_OFFSET: Record<PassDir, number> = { left: 1, right: 3, across: 2, none: 0 };
export const passDirOf = (handNum: number): PassDir => PASS_DIRS[handNum % 4]!;

const isHeart = (c: HCard) => c.s === 1;
const isQueenOfSpades = (c: HCard) => c.s === 0 && c.r === 12;
export const pointsOf = (c: HCard): number => (isHeart(c) ? 1 : isQueenOfSpades(c) ? 13 : 0);
const isPoint = (c: HCard) => pointsOf(c) > 0;
const isTwoOfClubs = (c: HCard) => c.s === 3 && c.r === 2;

export interface HeartsState {
  phase: Phase;
  handNum: number;
  hands: HCard[][];
  /** Passing phase: each seat's chosen card indexes (null until they pass). */
  passes: (number[] | null)[];
  /** Card each seat has played into the current trick. */
  trick: (HCard | null)[];
  leader: number;
  turn: number;
  trickNum: number;
  heartsBroken: boolean;
  /** Points taken so far this hand, per seat. */
  handPoints: number[];
  scores: number[];
  /** The trick on display during trickEnd went to this seat. */
  trickWinner: number | null;
  /** Handover: the hand's scored damage + moon shooter, for display. */
  handSummary: { deltas: number[]; shooter: number | null } | null;
  endsAt: number;
  names: string[];
  /** Game over: the lowest-score seat wins. */
  winner: number | null;
  lastShooter: number | null;
}

export interface HeartsView {
  phase: Phase;
  handNum: number;
  passDir: PassDir;
  myIndex: number;
  /** Own sorted hand — other hands never leave the server (table gets null). */
  hand: HCard[] | null;
  /** Per hand card: may I play/pick it right now? */
  legal: boolean[] | null;
  passed: boolean[];
  trick: (HCard | null)[];
  leader: number;
  turn: number;
  ledSuit: number | null;
  heartsBroken: boolean;
  trickWinner: number | null;
  trickNum: number;
  handPoints: number[];
  scores: number[];
  names: string[];
  endsAt: number;
  handSummary: { deltas: number[]; shooter: number | null } | null;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildDeck(): HCard[] {
  const deck: HCard[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ r, s });
  return deck;
}

/** Display order ♣ ♦ ♠ ♥ (alternating colors), low to high inside a suit. */
const SUIT_POS = [2, 3, 1, 0];
const sortHand = (hand: HCard[]): HCard[] =>
  [...hand].sort((a, b) => SUIT_POS[a.s]! - SUIT_POS[b.s]! || a.r - b.r);

const clone = (s: HeartsState): HeartsState => ({
  ...s,
  hands: s.hands.map((h) => [...h]),
  passes: s.passes.map((p) => (p ? [...p] : null)),
  trick: [...s.trick],
  handPoints: [...s.handPoints],
  scores: [...s.scores],
  handSummary: s.handSummary ? { ...s.handSummary, deltas: [...s.handSummary.deltas] } : null,
});

const ledSuitOf = (s: HeartsState): number | null =>
  s.leader >= 0 ? (s.trick[s.leader]?.s ?? null) : null;

/** Which cards seat `me` (whose turn it is) may play right now. */
function legalMask(s: HeartsState, me: number): boolean[] {
  const hand = s.hands[me]!;
  const led = ledSuitOf(s);
  if (led === null) {
    // leading — the very first play must be the 2♣
    if (s.trickNum === 0) return hand.map(isTwoOfClubs);
    const onlyHearts = hand.every(isHeart);
    return hand.map((c) => s.heartsBroken || onlyHearts || !isHeart(c));
  }
  if (hand.some((c) => c.s === led)) return hand.map((c) => c.s === led);
  // void in the led suit: anything goes, except points on the first trick
  if (s.trickNum === 0) {
    const onlyPoints = hand.every(isPoint);
    return hand.map((c) => onlyPoints || !isPoint(c));
  }
  return hand.map(() => true);
}

const seatOf = (ctx: MoveCtx): number => ctx.players.findIndex((p) => p.id === ctx.playerId);

/** The 2♣ holder opens the hand. */
function startPlay(s: HeartsState): HeartsState {
  const holder = s.hands.findIndex((h) => h.some(isTwoOfClubs));
  s.phase = 'play';
  s.leader = holder;
  s.turn = holder;
  s.endsAt = 0;
  return s;
}

function deal(s: HeartsState, random: () => number): HeartsState {
  const deck = shuffle(buildDeck(), random);
  s.hands = [0, 1, 2, 3].map((i) => sortHand(deck.slice(i * 13, (i + 1) * 13)));
  s.passes = [null, null, null, null];
  s.trick = [null, null, null, null];
  s.leader = -1;
  s.turn = -1;
  s.trickNum = 0;
  s.heartsBroken = false;
  s.handPoints = [0, 0, 0, 0];
  s.trickWinner = null;
  s.handSummary = null;
  s.endsAt = 0;
  if (passDirOf(s.handNum) === 'none') return startPlay(s);
  s.phase = 'passing';
  return s;
}

const game: GameDef<HeartsState, HeartsView> = {
  setup({ players, random }) {
    const s: HeartsState = {
      phase: 'passing',
      handNum: 0,
      hands: [],
      passes: [null, null, null, null],
      trick: [null, null, null, null],
      leader: -1,
      turn: -1,
      trickNum: 0,
      heartsBroken: false,
      handPoints: [0, 0, 0, 0],
      scores: [0, 0, 0, 0],
      trickWinner: null,
      handSummary: null,
      endsAt: 0,
      names: players.map((p) => p.name),
      winner: null,
      lastShooter: null,
    };
    return deal(s, random);
  },

  moves: {
    /** Pick exactly 3 cards to pass; they transfer once all four seats picked. */
    passCards(state, ctx, indexes: number[]) {
      if (state.phase !== 'passing' || state.winner !== null) return state;
      const me = seatOf(ctx);
      if (me < 0 || state.passes[me]) return state;
      if (!Array.isArray(indexes) || indexes.length !== 3) return state;
      const hand = state.hands[me]!;
      if (!indexes.every((i) => Number.isInteger(i) && i >= 0 && i < hand.length)) return state;
      if (new Set(indexes).size !== 3) return state;

      const s = clone(state);
      s.passes[me] = [...indexes];
      if (s.passes.some((p) => p === null)) return s;
      // everyone picked — transfer simultaneously, then the 2♣ leads
      const offset = PASS_OFFSET[passDirOf(s.handNum)];
      const given = s.passes.map((idxs, i) => idxs!.map((j) => s.hands[i]![j]!));
      const kept = s.hands.map((h, i) => h.filter((_, j) => !s.passes[i]!.includes(j)));
      given.forEach((cards, i) => kept[(i + offset) % 4]!.push(...cards));
      s.hands = kept.map(sortHand);
      return startPlay(s);
    },

    playCard(state, ctx, index: number) {
      if (state.phase !== 'play' || state.winner !== null) return state;
      const me = seatOf(ctx);
      if (me < 0 || me !== state.turn) return state;
      if (!Number.isInteger(index) || index < 0 || index >= state.hands[me]!.length) return state;
      if (!legalMask(state, me)[index]) return state;

      const s = clone(state);
      const card = s.hands[me]!.splice(index, 1)[0]!;
      s.trick[me] = card;
      if (isPoint(card)) s.heartsBroken = true;
      if (s.trick.some((c) => c === null)) {
        s.turn = (me + 1) % 4;
        return s;
      }
      // trick complete — highest card of the led suit takes it
      const led = s.trick[s.leader]!.s;
      let win = s.leader;
      for (let i = 0; i < 4; i++) {
        const c = s.trick[i]!;
        if (c.s === led && c.r > s.trick[win]!.r) win = i;
      }
      s.trickWinner = win;
      s.phase = 'trickEnd';
      s.turn = -1;
      s.endsAt = ctx.now + TRICK_END_MS;
      return s;
    },

    /** Trick-clear timer (table-driven, phones back it up; idempotent). */
    clearTrick(state, ctx) {
      if (state.phase !== 'trickEnd' || state.winner !== null) return state;
      if (ctx.now < state.endsAt - 250) return state;
      const win = state.trickWinner;
      if (win === null) return state;

      const s = clone(state);
      s.handPoints[win]! += s.trick.reduce((sum, c) => sum + (c ? pointsOf(c) : 0), 0);
      s.trick = [null, null, null, null];
      s.trickWinner = null;
      s.trickNum += 1;
      if (s.trickNum < 13) {
        s.phase = 'play';
        s.leader = win;
        s.turn = win;
        s.endsAt = 0;
        return s;
      }
      // hand over — score it (a moon shooter scores 0, everyone else +26)
      const shot = s.handPoints.findIndex((p) => p === MOON_POINTS);
      const shooter = shot >= 0 ? shot : null;
      const deltas = s.handPoints.map((p, i) =>
        shooter !== null ? (i === shooter ? 0 : MOON_POINTS) : p,
      );
      s.scores = s.scores.map((total, i) => total + deltas[i]!);
      s.handSummary = { deltas, shooter };
      s.lastShooter = shooter;
      s.phase = 'handover';
      s.leader = -1;
      s.endsAt = ctx.now + HANDOVER_MS;
      if (Math.max(...s.scores) >= LOSING_SCORE) {
        let best = 0;
        s.scores.forEach((total, i) => {
          if (total < s.scores[best]!) best = i;
        });
        s.winner = best;
      }
      return s;
    },

    /** Handover timer (table-driven, phones back it up; idempotent). */
    nextHand(state, ctx) {
      if (state.phase !== 'handover' || state.winner !== null) return state;
      if (ctx.now < state.endsAt - 250) return state;
      const s = clone(state);
      s.handNum += 1;
      return deal(s, ctx.random);
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    const mine = myIndex >= 0 ? state.hands[myIndex]! : null;
    const legal =
      mine === null
        ? null
        : state.phase === 'play' && state.turn === myIndex
          ? legalMask(state, myIndex)
          : state.phase === 'passing' && !state.passes[myIndex]
            ? mine.map(() => true)
            : mine.map(() => false);
    return {
      phase: state.phase,
      handNum: state.handNum,
      passDir: passDirOf(state.handNum),
      myIndex,
      hand: mine,
      legal,
      passed: state.passes.map((p) => p !== null),
      trick: state.trick,
      leader: state.leader,
      turn: state.turn,
      ledSuit: ledSuitOf(state),
      heartsBroken: state.heartsBroken,
      trickWinner: state.trickWinner,
      trickNum: state.trickNum,
      handPoints: state.handPoints,
      scores: state.scores,
      names: state.names,
      endsAt: state.endsAt,
      handSummary: state.handSummary,
    };
  },

  isOver(state) {
    if (state.winner === null) return null;
    const moon =
      state.lastShooter !== null ? ` ${state.names[state.lastShooter]} shot the moon!` : '';
    return {
      text: `💘 ${state.names[state.winner]} dodges the queen — ${state.scores[state.winner]} points! 🏆${moon}`,
    };
  },
};

export default game;
