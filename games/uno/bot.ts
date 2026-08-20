import { isLegal, type Card, type Color, type Sym } from './game.js';

/**
 * An UNO player that only knows what a person in that seat would know: its own
 * hand, the top of the discard pile and the active colour. It never reads the
 * other hands or the order of the draw pile.
 */

const COLORS: Color[] = ['r', 'g', 'b', 'y'];

const ACTIONS: Sym[] = ['skip', 'rev', '+2'];

const isAction = (c: Card): boolean => ACTIONS.includes(c.s);

/**
 * How much a normal bot likes each legal card: colour actions first (they hurt
 * the next player and clear the colour), then a card of the running colour, then
 * a symbol match, and wilds last — they are the cards that are always playable,
 * so they are worth holding back.
 */
function rank(card: Card, color: Color): number {
  if (card.c === 'w') return card.s === '+4' ? 0 : 1;
  if (card.c === color) return isAction(card) ? 5 : 4;
  return isAction(card) ? 3 : 2;
}

/** The colour this hand is heaviest in — what a wild should be turned into. */
export function bestColor(hand: Card[], skipIdx: number, random: () => number): Color {
  const counts = new Map<Color, number>(COLORS.map((c) => [c, 0]));
  hand.forEach((card, i) => {
    if (i === skipIdx || card.c === 'w') return;
    counts.set(card.c, (counts.get(card.c) ?? 0) + 1);
  });
  let best: Color | null = null;
  for (const c of COLORS) if (best === null || (counts.get(c) ?? 0) > (counts.get(best) ?? 0)) best = c;
  return (counts.get(best ?? 'r') ?? 0) > 0 ? best! : randomColor(random);
}

export const randomColor = (random: () => number): Color =>
  COLORS[Math.min(COLORS.length - 1, Math.floor(random() * COLORS.length))]!;

/**
 * Which card to play, and (for a wild) which colour to call. Returns null when
 * nothing in hand is legal — the caller draws instead.
 */
export function choose(
  hand: Card[],
  top: Card,
  color: Color,
  level: string,
  random: () => number,
): { cardIdx: number; color?: Color } | null {
  const legal = hand.flatMap((card, i) => (isLegal(card, top, color) ? [i] : []));
  if (legal.length === 0) return null;

  // easy plays whatever comes to hand first and calls a colour at random
  const cardIdx =
    level === 'easy'
      ? legal[0]!
      : legal.reduce((a, b) => (rank(hand[b]!, color) > rank(hand[a]!, color) ? b : a));

  const card = hand[cardIdx]!;
  if (card.c !== 'w') return { cardIdx };
  return { cardIdx, color: level === 'easy' ? randomColor(random) : bestColor(hand, cardIdx, random) };
}
