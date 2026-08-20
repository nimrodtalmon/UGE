/** Card encoding and Klondike legality, shared by the rules and the phone UI. */

/**
 * A card is an id 0..51: suit = id / 13 (0 ♠, 1 ♥, 2 ♦, 3 ♣), rank = id % 13 + 1
 * (1 = ace, 11..13 = J/Q/K). Piles are arrays with the TOP card last.
 */
export const DECK_SIZE = 52;
export const PILES = 7;
export const SUITS = ['♠', '♥', '♦', '♣'];

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const suitOf = (id: number): number => Math.floor(id / 13);
export const rankOf = (id: number): number => (id % 13) + 1;
export const isRed = (id: number): boolean => suitOf(id) === 1 || suitOf(id) === 2;
export const rankLabel = (id: number): string => RANK_LABELS[rankOf(id) - 1]!;

/** The top card of a pile, or null when it is empty. */
export const topOf = (pile: number[]): number | null =>
  pile.length > 0 ? pile[pile.length - 1]! : null;

export function buildDeck(): number[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

export function shuffle(cards: number[], random: () => number): number[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Tableau: builds DOWN in alternating colours; only a King starts an empty pile. */
export function canStack(card: number, onto: number | null): boolean {
  if (onto === null) return rankOf(card) === 13;
  return isRed(card) !== isRed(onto) && rankOf(card) === rankOf(onto) - 1;
}

/** Foundation: builds UP by suit from the ace. */
export function canFound(card: number, top: number | null): boolean {
  if (top === null) return rankOf(card) === 1;
  return suitOf(card) === suitOf(top) && rankOf(card) === rankOf(top) + 1;
}

/** A movable tableau run: descending ranks in alternating colours. */
export function isRun(cards: number[]): boolean {
  if (cards.length === 0) return false;
  for (let i = 1; i < cards.length; i++) if (!canStack(cards[i]!, cards[i - 1]!)) return false;
  return true;
}

/**
 * Whether a run headed by `head` may land on a tableau pile topped by `destTop`.
 * `wholePile` marks a run that is its source pile's entire contents (nothing
 * face-down under it): shifting that onto another empty pile changes nothing,
 * so it is neither offered nor accepted.
 */
export function canMoveRun(head: number, wholePile: boolean, destTop: number | null): boolean {
  if (!canStack(head, destTop)) return false;
  return !(destTop === null && wholePile);
}

/** Move argument naming a card source: the waste, or a tableau pile. */
export type SourceId = 'waste' | `p${number}`;
export type Source = { kind: 'waste' } | { kind: 'pile'; pile: number };

export const pileSource = (pile: number): SourceId => `p${pile}`;

/** Parse a client-supplied source id — hostile input, so nothing is assumed. */
export function parseSource(from: unknown): Source | null {
  if (from === 'waste') return { kind: 'waste' };
  if (typeof from !== 'string' || !/^p[0-9]$/.test(from)) return null;
  const pile = Number(from.slice(1));
  return pile < PILES ? { kind: 'pile', pile } : null;
}
