/**
 * Set's rules kernel: the 81-card deck, set detection and the table itself
 * (dealing, replacing, and the "no set on the table — deal three more" rule).
 *
 * Separate from game.ts so the views can import the card decoder without
 * pulling the game logic into every phone's view bundle.
 *
 * A card is one number 0..80 read as four base-3 digits:
 *   count (1..3) · colour · shape · fill
 * Three cards are a set when, for every digit, the three values are all the
 * same or all different — which, in base 3, is exactly "their sum is 0 mod 3".
 */

/** One card, encoded as a number 0..80. */
export type Card = number;

export const DECK_SIZE = 81;
/** The table is twelve cards, and grows only when it has to. */
export const BOARD_MIN = 12;

export interface CardAttrs {
  /** 0, 1 or 2 → one, two or three symbols. */
  n: 0 | 1 | 2;
  /** 0 red · 1 green · 2 purple. */
  c: 0 | 1 | 2;
  /** 0 diamond · 1 squiggle · 2 oval. */
  s: 0 | 1 | 2;
  /** 0 solid · 1 striped · 2 empty. */
  f: 0 | 1 | 2;
}

const digit = (card: Card, place: number): 0 | 1 | 2 =>
  (Math.floor(card / place) % 3) as 0 | 1 | 2;

export function attrsOf(card: Card): CardAttrs {
  return { n: digit(card, 27), c: digit(card, 9), s: digit(card, 3), f: digit(card, 1) };
}

export const makeDeck = (): Card[] => Array.from({ length: DECK_SIZE }, (_, i) => i);

/** Fisher–Yates on a copy, driven by the platform's seeded random. */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function isSet(a: Card, b: Card, c: Card): boolean {
  for (const place of [27, 9, 3, 1]) {
    if ((digit(a, place) + digit(b, place) + digit(c, place)) % 3 !== 0) return false;
  }
  return true;
}

/**
 * The one card that completes the set with `a` and `b` — every pair has
 * exactly one. This is what makes set detection O(n²) instead of O(n³).
 */
export function thirdCard(a: Card, b: Card): Card {
  let card = 0;
  for (const place of [27, 9, 3, 1]) {
    const da = digit(a, place);
    const db = digit(b, place);
    card += (da === db ? da : 3 - da - db) * place;
  }
  return card;
}

/** The cards actually lying face up (a slot may be an empty gap at the end). */
export const faceUp = (board: (Card | null)[]): Card[] =>
  board.filter((c): c is Card => c !== null);

export function hasSet(cards: Card[]): boolean {
  const present = new Set(cards);
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const need = thirdCard(cards[i]!, cards[j]!);
      if (need !== cards[i] && need !== cards[j] && present.has(need)) return true;
    }
  }
  return false;
}

/** Every set on the table, as triples of BOARD SLOT indices (sorted). */
export function findSets(board: (Card | null)[]): number[][] {
  const slots: number[] = [];
  for (let i = 0; i < board.length; i++) if (board[i] !== null) slots.push(i);
  const where = new Map<Card, number>();
  for (const i of slots) where.set(board[i]!, i);

  const out: number[][] = [];
  for (let x = 0; x < slots.length; x++) {
    for (let y = x + 1; y < slots.length; y++) {
      const i = slots[x]!;
      const j = slots[y]!;
      const k = where.get(thirdCard(board[i]!, board[j]!));
      // k > j keeps each triple once, in slot order
      if (k !== undefined && k > j) out.push([i, j, k]);
    }
  }
  return out;
}

export interface Table {
  board: (Card | null)[];
  deck: Card[];
}

/**
 * Bring a table back to a legal position after cards were taken (or at the
 * very start). Three steps, in this order:
 *
 *  1. An over-sized table shrinks back toward twelve — cards taken from a
 *     15/18/21-card table are NOT replaced. The last card slides into the
 *     first gap so the rest keep their places.
 *  2. Remaining gaps are refilled from the deck IN PLACE, so nothing that is
 *     still on the table moves under anybody's finger.
 *  3. The real rule people get wrong: while no set is on the table, deal
 *     three more. This is a loop, not a single deal — three fresh cards can
 *     still leave a setless table. It provably ends: 21 cards always contain
 *     a set, and each pass empties the deck by three.
 */
export function settle(boardIn: (Card | null)[], deckIn: Card[]): Table {
  const board = [...boardIn];
  const deck = [...deckIn];

  while (board.length > BOARD_MIN && board.some((c) => c === null)) {
    const last = board[board.length - 1];
    if (last === null || last === undefined) {
      board.pop();
      continue;
    }
    const gap = board.indexOf(null);
    if (gap < 0 || gap >= board.length - 1) break;
    board[gap] = last;
    board.pop();
  }

  for (let i = 0; i < board.length; i++) {
    if (board[i] === null && deck.length > 0) board[i] = deck.shift()!;
  }

  while (deck.length > 0 && !hasSet(faceUp(board))) {
    for (let k = 0; k < 3 && deck.length > 0; k++) board.push(deck.shift()!);
  }

  return { board, deck };
}
