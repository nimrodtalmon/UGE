/** A shoe of ordinary playing cards, and the arithmetic blackjack runs on. */

export interface BCard {
  /** 1 = ace, 11/12/13 = J/Q/K. */
  r: number;
  /** Index into SUITS. */
  s: number;
}

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RED = [1, 2];

export function rankLabel(r: number): string {
  if (r === 1) return 'A';
  if (r === 11) return 'J';
  if (r === 12) return 'Q';
  if (r === 13) return 'K';
  return String(r);
}

/** Ace counts 11 here; total() drops it to 1 when the hand would bust. */
export function cardValue(r: number): number {
  if (r === 1) return 11;
  return r >= 10 ? 10 : r;
}

/** Best total for a hand, and whether an ace is still counting as 11. */
export function total(cards: BCard[]): { value: number; soft: boolean } {
  let value = 0;
  let aces = 0;
  for (const c of cards) {
    value += cardValue(c.r);
    if (c.r === 1) aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return { value, soft: aces > 0 };
}

export const isNatural = (cards: BCard[]): boolean =>
  cards.length === 2 && total(cards).value === 21;

export function buildShoe(decks: number): BCard[] {
  const shoe: BCard[] = [];
  for (let d = 0; d < decks; d++) {
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) shoe.push({ r, s });
  }
  return shoe;
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Hi-Lo tag: low cards gone is good for the player, high cards gone is bad. */
export function countTag(r: number): number {
  const v = cardValue(r);
  if (v >= 10) return -1; // ten, face or ace
  if (r >= 2 && r <= 6) return 1;
  return 0;
}
