import type { HCard } from './game.js';

/**
 * A Hearts player that only knows what its own seat can see: the thirteen
 * cards in its own hand, the cards on the table, and — through `playedSet` —
 * which cards have already gone by. No decision function below is ever handed
 * another seat's hand, so the bot cannot know who holds the queen; it works it
 * out the way a person does, from what has been played.
 */

const SPADES = 0;
const HEARTS = 1;
const QUEEN = 12;

const isHeart = (c: HCard) => c.s === HEARTS;
const isQueen = (c: HCard) => c.s === SPADES && c.r === QUEEN;
const isBigSpade = (c: HCard) => c.s === SPADES && c.r > QUEEN;

/** gone[suit][rank]: the card is no longer in anybody's hand. */
export type Gone = boolean[][];

/**
 * The cards that have already been played this hand.
 *
 * Every one of the 52 cards is dealt in Hearts, so the cards still to come are
 * exactly the ones sitting in the four hands: subtract those from the deck and
 * what is left is the pile any attentive player has watched go by (the open
 * trick included — those cards are face up on the table). The hands go in only
 * to be subtracted and seat attribution is dropped right here: the result says
 * WHICH cards are gone, never WHO holds what, and it is the only thing the
 * strategy below learns about the other three seats.
 */
export function playedSet(hands: HCard[][]): Gone {
  const gone: Gone = [0, 1, 2, 3].map(() => {
    const suit = new Array<boolean>(15).fill(false);
    for (let r = 2; r <= 14; r++) suit[r] = true;
    return suit;
  });
  for (const hand of hands) for (const c of hand) gone[c.s]![c.r] = false;
  return gone;
}

/** Everything one seat may legitimately use to pick a card. */
export interface Seen {
  /** This seat's own cards, in hand order (the index is what `playCard` takes). */
  hand: HCard[];
  /** Which of them the rules allow right now — the game's own legal mask. */
  legal: boolean[];
  /** Face up on the table: what each seat has played into the current trick. */
  trick: (HCard | null)[];
  leader: number;
  trickNum: number;
  heartsBroken: boolean;
  gone: Gone;
  level: string;
  random: () => number;
}

const suitLength = (hand: HCard[], s: number): number => hand.filter((c) => c.s === s).length;

/** Cards of `s` the other three seats still hold, counted from what is gone. */
const outstanding = (k: Seen, s: number): number => {
  let count = 13;
  for (let r = 2; r <= 14; r++) if (k.gone[s]![r]) count--;
  return count - suitLength(k.hand, s);
};

/** The highest card of `s` somebody else could still hold (0 when none). */
const highestOut = (k: Seen, s: number): number => {
  for (let r = 14; r >= 2; r--) {
    if (!k.gone[s]![r] && !k.hand.some((c) => c.s === s && c.r === r)) return r;
  }
  return 0;
};

const queenIsOut = (k: Seen): boolean =>
  !k.gone[SPADES]![QUEEN] && !k.hand.some(isQueen);

// ---------------------------------------------------------------- passing

/**
 * How badly this seat wants to be rid of a card. The queen goes first, then
 * high spades while the hand is too short to protect them, then the big hearts
 * and the side aces; low cards score low and stay, because low cards are what
 * lets a seat duck out of a trick later.
 */
export function passValue(c: HCard, hand: HCard[], level: string): number {
  if (level === 'easy') return c.r; // easy just sheds its three biggest cards
  const len = suitLength(hand, c.s);
  if (isQueen(c)) return 1000;
  if (isBigSpade(c)) return len <= 4 ? 900 + c.r : 300 + c.r;
  if (isHeart(c)) return c.r >= 11 ? 700 + c.r : 10 + c.r;
  let v = c.r >= 12 ? 400 + c.r : c.r;
  // sharp will happily give away a whole short suit to be void in it
  if (level === 'sharp' && c.s !== SPADES && len <= 2) v += 150;
  return v;
}

/** Three hand indexes to pass. */
export function pickPass(hand: HCard[], level: string, random: () => number): number[] {
  return hand
    .map((c, i) => ({ i, v: passValue(c, hand, level) + random() * 0.5 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((x) => x.i);
}

// ------------------------------------------------------------------- play

const lowestOf = (k: Seen, idx: number[]): number =>
  idx.reduce((best, i) => (k.hand[i]!.r < k.hand[best]!.r ? i : best), idx[0]!);
const highestOf = (k: Seen, idx: number[]): number =>
  idx.reduce((best, i) => (k.hand[i]!.r > k.hand[best]!.r ? i : best), idx[0]!);

/** Leading: low, from a short suit, and never into a trick this seat must win. */
function lead(k: Seen, idx: number[]): number {
  let best = idx[0]!;
  let bestScore = Infinity;
  for (const i of idx) {
    const c = k.hand[i]!;
    const len = suitLength(k.hand, c.s);
    let v = c.r + (len - 1) * 1.2;
    if (c.s === SPADES) {
      if (queenIsOut(k) && c.r > QUEEN) v += 100; // an ace of spades collects the queen
      if (k.hand.some(isQueen)) v += 30; // holding her: stay out of spades altogether
    }
    if (isHeart(c)) v += 20; // even once broken, hearts are somebody else's problem
    if (k.level === 'sharp') {
      const out = outstanding(k, c.s);
      if (out === 0) v += 60; // nobody can follow — they would all dump points on it
      else if (c.r > highestOut(k, c.s)) v += 25; // this trick is certainly mine
      else v -= 10; // somebody can beat it: a safe lead
      if (len === 1) v -= 8; // and it makes this seat void
    }
    v += k.random() * 0.5;
    if (v < bestScore) {
      bestScore = v;
      best = i;
    }
  }
  return best;
}

/** Following suit: duck under the trick when possible, else win it cheaply. */
function follow(k: Seen, idx: number[], led: number): number {
  const played = k.trick.filter((c): c is HCard => c !== null);
  const high = Math.max(...played.filter((c) => c.s === led).map((c) => c.r));
  const last = k.trick.filter((c) => c === null).length === 1;
  const points = played.some((c) => isHeart(c) || isQueen(c));

  const under = idx.filter((i) => k.hand[i]!.r < high);
  if (under.length > 0) {
    // safe: none of these can take the trick — shed the queen first, else the
    // biggest card that still loses
    const queen = under.find((i) => isQueen(k.hand[i]!));
    return queen ?? highestOf(k, under);
  }
  // every card left in this suit wins the trick
  if (last && !points) return highestOf(k, idx); // free trick — dump the biggest
  return lowestOf(k, idx);
}

/** Void in the led suit: this is the moment to be rid of the dangerous cards. */
function discard(k: Seen, idx: number[]): number {
  let best = idx[0]!;
  let bestScore = -Infinity;
  for (const i of idx) {
    const c = k.hand[i]!;
    const len = suitLength(k.hand, c.s);
    let v: number;
    if (isQueen(c)) v = 1000;
    else if (isBigSpade(c)) v = queenIsOut(k) ? 800 + c.r : 400 + c.r;
    else if (isHeart(c)) v = c.r >= 10 ? 600 + c.r : 200 + c.r;
    else v = c.r >= 12 ? 300 + c.r : c.r * 2;
    // sharp finishes off a short suit so it can throw points away next time
    if (k.level === 'sharp' && v < 300 && len <= 2) v += 60;
    v += k.random() * 0.5;
    if (v > bestScore) {
      bestScore = v;
      best = i;
    }
  }
  return best;
}

/** Index of the card to play, or -1 when nothing is legal (never happens). */
export function pickPlay(k: Seen): number {
  const idx = k.legal.flatMap((ok, i) => (ok ? [i] : []));
  if (idx.length <= 1) return idx[0] ?? -1;

  if (k.level === 'easy') {
    // loose: half the time the lowest card in front of it, half the time anything
    if (k.random() < 0.5) return idx[Math.floor(k.random() * idx.length)]!;
    return lowestOf(k, idx);
  }

  const led = k.leader >= 0 ? (k.trick[k.leader]?.s ?? null) : null;
  if (led === null) return lead(k, idx);
  if (idx.every((i) => k.hand[i]!.s === led)) return follow(k, idx, led);
  return discard(k, idx);
}
