import type { GameDef } from '../../src/shared/plugin.js';

export type Color = 'r' | 'g' | 'b' | 'y';
export type Sym = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'rev' | '+2' | 'wild' | '+4';

export interface Card {
  c: Color | 'w';
  s: Sym;
}

export interface WcState {
  hands: Card[][];
  draw: Card[];
  discard: Card[];
  color: Color;
  turn: number;
  dir: 1 | -1;
  /** A just-drawn playable card: its owner may play it or keep it. */
  pending: { player: number; cardIdx: number } | null;
  winner: number | null;
  playerNames: string[];
  /** One shared phone passed around; seats are virtual. */
  hotseat: boolean;
  /** Hotseat: current player tapped "show my cards" (locks again on turn change). */
  unlocked: boolean;
}

export interface WcView {
  hand: Card[] | null;
  hotseat: boolean;
  unlocked: boolean;
  counts: number[];
  top: Card;
  color: Color;
  turn: number;
  dir: 1 | -1;
  drawCount: number;
  pendingCardIdx: number | null; // set only for the player who drew it
  myIndex: number;
  winner: number | null;
  playerNames: string[];
}

const COLORS: Color[] = ['r', 'g', 'b', 'y'];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const c of COLORS) {
    deck.push({ c, s: '0' });
    for (const s of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', '+2'] as Sym[]) {
      deck.push({ c, s }, { c, s });
    }
  }
  for (let i = 0; i < 4; i++) deck.push({ c: 'w', s: 'wild' }, { c: 'w', s: '+4' });
  return deck;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function isLegal(card: Card, top: Card, color: Color): boolean {
  return card.c === 'w' || card.c === color || card.s === top.s;
}

/** Draw one card, reshuffling the discard pile (minus its top) when needed. */
function drawOne(s: WcState, random: () => number): { card: Card | null; next: WcState } {
  let { draw, discard } = s;
  if (draw.length === 0) {
    if (discard.length <= 1) return { card: null, next: s }; // nothing left anywhere
    draw = shuffle(discard.slice(0, -1), random);
    discard = discard.slice(-1);
  }
  const card = draw[draw.length - 1]!;
  return { card, next: { ...s, draw: draw.slice(0, -1), discard } };
}

const wrap = (i: number, n: number) => ((i % n) + n) % n;

function advance(s: WcState, played: Card | null, random: () => number): WcState {
  const n = s.hands.length;
  let dir = s.dir;
  let step = 1;
  let next = s;
  if (played) {
    if (played.s === 'rev') {
      if (n === 2) step = 2; // reverse acts as skip head-to-head
      else dir = (dir * -1) as 1 | -1;
    }
    if (played.s === 'skip') step = 2;
    if (played.s === '+2' || played.s === '+4') {
      const victim = wrap(s.turn + dir, n);
      const count = played.s === '+2' ? 2 : 4;
      const hands = next.hands.map((h) => [...h]);
      for (let i = 0; i < count; i++) {
        const { card, next: after } = drawOne({ ...next, hands }, random);
        next = { ...after, hands };
        if (card) hands[victim]!.push(card);
      }
      next = { ...next, hands };
      step = 2; // the victim also loses their turn
    }
  }
  return { ...next, dir, turn: wrap(s.turn + dir * step, n) };
}

/** Which seat may act for this request — the device owner, or the unlocked hotseat. */
function actorSeat(state: WcState, ctx: { playerId: string; role: string; players: { id: string }[] }): number {
  if (state.hotseat) {
    return ctx.role === 'hand' && state.unlocked ? state.turn : -1;
  }
  return ctx.players.findIndex((p) => p.id === ctx.playerId);
}

/** Hotseat: lock the phone again whenever the turn moves on. */
function lockIfPassed(prevTurn: number, next: WcState): WcState {
  return next.hotseat && next.winner === null && next.turn !== prevTurn
    ? { ...next, unlocked: false }
    : next;
}

const game: GameDef<WcState, WcView> = {
  setup({ players, random, mode, group }) {
    const hotseat = mode.config['hotseat'] === true;
    const seats = hotseat ? Math.max(2, Math.min(8, group?.players ?? 2)) : players.length;
    let deck = shuffle(buildDeck(), random);
    const hands = Array.from({ length: seats }, () => deck.splice(0, 7));
    // first discard: keep flipping until it's a plain number card
    let topIdx = deck.findIndex((c) => c.c !== 'w' && Number.isInteger(Number(c.s)));
    if (topIdx < 0) topIdx = deck.length - 1;
    const top = deck.splice(topIdx, 1)[0]!;
    return {
      hands,
      draw: deck,
      discard: [top],
      color: top.c as Color,
      turn: 0,
      dir: 1,
      pending: null,
      winner: null,
      playerNames: hotseat
        ? Array.from({ length: seats }, (_, i) => `Player ${i + 1}`)
        : players.map((p) => p.name),
      hotseat,
      unlocked: false,
    };
  },

  moves: {
    play(state, ctx, cardIdx: number, chosen?: Color) {
      if (state.winner !== null) return state;
      const me = actorSeat(state, ctx);
      if (me < 0 || me !== state.turn) return state;
      if (state.pending && (state.pending.player !== me || state.pending.cardIdx !== cardIdx)) {
        return state; // after drawing you may only play the drawn card
      }
      const card = state.hands[me]?.[cardIdx];
      if (!card) return state;
      const top = state.discard[state.discard.length - 1]!;
      if (!isLegal(card, top, state.color)) return state;
      const color: Color =
        card.c === 'w' ? (COLORS.includes(chosen as Color) ? (chosen as Color) : 'r') : card.c;
      const hands = state.hands.map((h, i) => (i === me ? h.filter((_, j) => j !== cardIdx) : h));
      let next: WcState = {
        ...state,
        hands,
        discard: [...state.discard, card],
        color,
        pending: null,
      };
      if (hands[me]!.length === 0) return { ...next, winner: me };
      return lockIfPassed(me, advance(next, card, ctx.random));
    },

    draw(state, ctx) {
      if (state.winner !== null || state.pending) return state;
      const me = actorSeat(state, ctx);
      if (me < 0 || me !== state.turn) return state;
      const { card, next } = drawOne(state, ctx.random);
      if (!card) return lockIfPassed(me, advance(state, null, ctx.random)); // decks exhausted — just pass
      const hands = next.hands.map((h, i) => (i === me ? [...h, card] : h));
      const top = state.discard[state.discard.length - 1]!;
      if (isLegal(card, top, state.color)) {
        return { ...next, hands, pending: { player: me, cardIdx: hands[me]!.length - 1 } };
      }
      return lockIfPassed(me, advance({ ...next, hands }, null, ctx.random));
    },

    /** Keep the drawn playable card and pass the turn. */
    keep(state, ctx) {
      if (state.winner !== null || !state.pending) return state;
      const me = actorSeat(state, ctx);
      if (me !== state.pending.player) return state;
      return lockIfPassed(me, advance({ ...state, pending: null }, null, ctx.random));
    },

    /** Hotseat: the next player picked the phone up. */
    takePhone(state, ctx) {
      if (!state.hotseat || state.unlocked || state.winner !== null) return state;
      if (ctx.role !== 'hand') return state;
      return { ...state, unlocked: true };
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    const hand = state.hotseat
      ? state.unlocked
        ? state.hands[state.turn]!
        : null
      : myIndex >= 0
        ? state.hands[myIndex]!
        : null;
    return {
      hand,
      hotseat: state.hotseat,
      unlocked: state.unlocked,
      counts: state.hands.map((h) => h.length),
      top: state.discard[state.discard.length - 1]!,
      color: state.color,
      turn: state.turn,
      dir: state.dir,
      drawCount: state.draw.length,
      pendingCardIdx:
        state.pending && state.pending.player === (state.hotseat ? state.turn : myIndex) && (!state.hotseat || state.unlocked)
          ? state.pending.cardIdx
          : null,
      myIndex,
      winner: state.winner,
      playerNames: state.playerNames,
    };
  },

  isOver(state) {
    return state.winner !== null
      ? { text: `${state.playerNames[state.winner]} wins! 🎉` }
      : null;
  },
};

export default game;
