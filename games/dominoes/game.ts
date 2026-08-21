import type { GameDef } from '../../src/shared/plugin.js';
import { decide, type Knowledge } from './bot.js';
import {
  endsFor,
  fullSet,
  halves,
  handPips,
  isDouble,
  legalPlays,
  orient,
  pipsOf,
  type End,
  type Placed,
} from './tiles.js';

export type { End, Placed } from './tiles.js';

export interface DomState {
  hands: string[][];
  /** Face-down draw pile — a count is public, the tiles never are. */
  boneyard: string[];
  chain: Placed[];
  turn: number;
  names: string[];
  /** Per seat: numbers it could not match when it passed (public knowledge). */
  passedOn: number[][];
  /** Consecutive passes — one per seat means the line is blocked. */
  passStreak: number;
  drawnThisTurn: number;
  lastAction: string;
  winner: number | null;
  finished: boolean;
  /** Revealed only when the game is over. */
  pips: number[] | null;
  resultText: string | null;
}

export interface DomView {
  /** Own tiles only — null for the table and for spectators. */
  hand: string[] | null;
  /** Playable tiles in that hand, with the ends each may go on. */
  legal: { id: string; ends: End[] }[];
  counts: number[];
  boneyard: number;
  chain: Placed[];
  left: number;
  right: number;
  turn: number;
  myIndex: number;
  names: string[];
  passedOn: number[][];
  drawnThisTurn: number;
  lastAction: string;
  winner: number | null;
  finished: boolean;
  pips: number[] | null;
  resultText: string | null;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function ends(chain: Placed[]): { left: number; right: number } {
  return { left: chain[0]!.a, right: chain[chain.length - 1]!.b };
}

/** Opening tile: highest double, or the heaviest tile when nobody holds one. */
function openingRank(id: string): number {
  const [a, b] = halves(id);
  return (isDouble(id) ? 1000 : 0) + pipsOf(id) * 10 + Math.max(a, b);
}

const seatOf = (ctx: { playerId: string; players: { id: string }[] }): number =>
  ctx.players.findIndex((p) => p.id === ctx.playerId);

const canPlay = (state: DomState, seat: number): boolean => {
  const { left, right } = ends(state.chain);
  return legalPlays(state.hands[seat] ?? [], left, right).length > 0;
};

/** End the game and report every hand's pip count, however it finished. */
function finishWith(state: DomState, winner: number | null, how: 'out' | 'blocked'): DomState {
  const pips = state.hands.map(handPips);
  const detail = state.hands.map((_, i) => `${state.names[i]} ${pips[i]}`).join(', ');
  const text =
    how === 'out'
      ? `${state.names[winner!]} is out — domino! 🎉 (${detail})`
      : winner === null
        ? `blocked — dead heat on ${Math.min(...pips)} pips (${detail})`
        : `blocked — ${state.names[winner]} wins on ${pips[winner]} pips (${detail})`;
  return { ...state, winner, finished: true, pips, resultText: text };
}

const game: GameDef<DomState, DomView> = {
  setup({ players, random }) {
    const seats = players.length;
    const deck = shuffle(fullSet(), random);
    const handSize = seats === 2 ? 7 : 5;
    const hands = Array.from({ length: seats }, () => deck.splice(0, handSize));

    // the highest double on the table opens; failing that the heaviest tile
    let opener = 0;
    let openId = hands[0]![0]!;
    hands.forEach((hand, seat) => {
      for (const id of hand) {
        if (openingRank(id) > openingRank(openId)) {
          openId = id;
          opener = seat;
        }
      }
    });
    const [a, b] = halves(openId);
    const names = players.map((p) => p.name);
    return {
      hands: hands.map((h, i) => (i === opener ? h.filter((id) => id !== openId) : h)),
      boneyard: deck,
      chain: [{ id: openId, a, b }],
      turn: (opener + 1) % seats,
      names,
      passedOn: Array.from({ length: seats }, () => []),
      passStreak: 0,
      drawnThisTurn: 0,
      lastAction: `${names[opener]} opened with ${a}:${b}`,
      winner: null,
      finished: false,
      pips: null,
      resultText: null,
    };
  },

  moves: {
    /** Lay a tile from your hand on the left or right end of the line. */
    play(state, ctx, tileId: string, end: End) {
      if (state.finished) return state;
      const me = seatOf(ctx);
      if (me < 0 || me !== state.turn) return state;
      if (typeof tileId !== 'string') return state;
      if (end !== 'left' && end !== 'right') return state;
      const hand = state.hands[me]!;
      if (!hand.includes(tileId)) return state;
      const { left, right } = ends(state.chain);
      if (!endsFor(tileId, left, right).includes(end)) return state;

      const placed = orient(tileId, end, end === 'left' ? left : right);
      const chain = end === 'left' ? [placed, ...state.chain] : [...state.chain, placed];
      const hands = state.hands.map((h, i) => (i === me ? h.filter((id) => id !== tileId) : h));
      const next: DomState = {
        ...state,
        hands,
        chain,
        passStreak: 0,
        drawnThisTurn: 0,
        turn: (me + 1) % state.hands.length,
        lastAction: `${state.names[me]} played ${placed.a}:${placed.b}`,
      };
      return hands[me]!.length === 0 ? finishWith(next, me, 'out') : next;
    },

    /** Take one tile from the boneyard — only when nothing in hand fits. */
    draw(state, ctx) {
      if (state.finished) return state;
      const me = seatOf(ctx);
      if (me < 0 || me !== state.turn) return state;
      if (state.boneyard.length === 0) return state;
      if (canPlay(state, me)) return state; // you draw only when you are stuck
      const tile = state.boneyard[0]!;
      return {
        ...state,
        boneyard: state.boneyard.slice(1),
        hands: state.hands.map((h, i) => (i === me ? [...h, tile] : h)),
        drawnThisTurn: state.drawnThisTurn + 1,
        lastAction: `${state.names[me]} drew a tile`,
      };
    },

    /** Give up the turn — only with an empty boneyard and nothing playable. */
    pass(state, ctx) {
      if (state.finished) return state;
      const me = seatOf(ctx);
      if (me < 0 || me !== state.turn) return state;
      if (state.boneyard.length > 0) return state;
      if (canPlay(state, me)) return state;
      const { left, right } = ends(state.chain);
      const seen = new Set(state.passedOn[me] ?? []);
      seen.add(left);
      seen.add(right);
      const passStreak = state.passStreak + 1;
      const next: DomState = {
        ...state,
        passedOn: state.passedOn.map((nums, i) => (i === me ? [...seen].sort() : nums)),
        passStreak,
        drawnThisTurn: 0,
        turn: (me + 1) % state.hands.length,
        lastAction: `${state.names[me]} passed`,
      };
      if (passStreak < state.hands.length) return next;

      // everyone in a row: the line is blocked, lightest hand takes it
      const pips = next.hands.map(handPips);
      const best = Math.min(...pips);
      const winners = pips.flatMap((p, i) => (p === best ? [i] : []));
      return finishWith(next, winners.length === 1 ? winners[0]! : null, 'blocked');
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    // only this device's own tiles travel — the table, spectators and every
    // other phone get counts. The boneyard is never sent at all.
    const hand = myIndex >= 0 ? state.hands[myIndex]! : null;
    const { left, right } = ends(state.chain);
    return {
      hand,
      legal: hand ? legalPlays(hand, left, right) : [],
      counts: state.hands.map((h) => h.length),
      boneyard: state.boneyard.length,
      chain: state.chain,
      left,
      right,
      turn: state.turn,
      myIndex,
      names: state.names,
      passedOn: state.passedOn,
      drawnThisTurn: myIndex === state.turn ? state.drawnThisTurn : 0,
      lastAction: state.lastAction,
      winner: state.winner,
      finished: state.finished,
      pips: state.pips,
      resultText: state.resultText,
    };
  },

  isOver(state) {
    return state.finished ? { text: state.resultText ?? 'game over' } : null;
  },

  /**
   * AI opponent — see bot.ts. It is handed a Knowledge object built here from
   * its OWN hand plus public table facts only: never another seat's tiles and
   * never the face of anything still in the boneyard.
   */
  bot(state, { seat, level, random }) {
    if (state.finished || state.turn !== seat) return null;
    const hand = state.hands[seat];
    if (!hand) return null;
    const { left, right } = ends(state.chain);
    const knowledge: Knowledge = {
      seat,
      hand: [...hand],
      left,
      right,
      chain: state.chain.map((t) => t.id),
      boneyard: state.boneyard.length,
      counts: state.hands.map((h) => h.length),
      passedOn: state.passedOn.map((nums) => [...nums]),
    };
    return decide(knowledge, level, random);
  },
};

export default game;
