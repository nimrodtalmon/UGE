/**
 * Pure scoring for the classic 13-category dice game. Shared by game.ts and
 * the views (phones preview what the current dice would score in each open
 * category). Simplification, deliberate: no extra bonus for repeat
 * five-of-a-kinds and no joker rules — a later five-of-a-kind just scores
 * wherever the player puts it, by the normal formulas.
 */

export type CategoryId =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  | 'threeKind'
  | 'fourKind'
  | 'fullHouse'
  | 'smallStraight'
  | 'largeStraight'
  | 'fiveKind'
  | 'chance';

export interface Category {
  id: CategoryId;
  name: string;
  /** Die face this upper-section category counts (ones..sixes only). */
  face?: number;
}

export const CATEGORIES: Category[] = [
  { id: 'ones', name: 'Ones', face: 1 },
  { id: 'twos', name: 'Twos', face: 2 },
  { id: 'threes', name: 'Threes', face: 3 },
  { id: 'fours', name: 'Fours', face: 4 },
  { id: 'fives', name: 'Fives', face: 5 },
  { id: 'sixes', name: 'Sixes', face: 6 },
  { id: 'threeKind', name: '3 of a kind' },
  { id: 'fourKind', name: '4 of a kind' },
  { id: 'fullHouse', name: 'Full house' },
  { id: 'smallStraight', name: 'Small straight' },
  { id: 'largeStraight', name: 'Large straight' },
  { id: 'fiveKind', name: 'Five of a kind' },
  { id: 'chance', name: 'Chance' },
];

/** One player's scorecard: points per category, null while open. */
export type Card = Record<CategoryId, number | null>;

export const UPPER_TARGET = 63;
export const UPPER_BONUS = 35;

const UPPER_IDS: CategoryId[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

export function emptyCard(): Card {
  const card = {} as Card;
  for (const c of CATEGORIES) card[c.id] = null;
  return card;
}

const sum = (dice: number[]): number => dice.reduce((a, b) => a + b, 0);

/** counts[f] = how many dice show face f (1..6). */
function counts(dice: number[]): number[] {
  const byFace = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) byFace[d] = (byFace[d] ?? 0) + 1;
  return byFace;
}

/** True when the dice contain `len` consecutive faces. */
function hasRun(dice: number[], len: number): boolean {
  const faces = [...new Set(dice)].sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < faces.length; i++) {
    run = faces[i] === faces[i - 1]! + 1 ? run + 1 : 1;
    if (run >= len) return true;
  }
  return run >= len;
}

export function scoreFor(id: CategoryId, dice: number[]): number {
  const byFace = counts(dice);
  const most = Math.max(...byFace.slice(1));
  switch (id) {
    case 'ones':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const face = CATEGORIES.find((c) => c.id === id)!.face!;
      return (byFace[face] ?? 0) * face;
    }
    case 'threeKind':
      return most >= 3 ? sum(dice) : 0;
    case 'fourKind':
      return most >= 4 ? sum(dice) : 0;
    case 'fullHouse': {
      const sorted = [...byFace.slice(1)].sort((a, b) => b - a);
      return (sorted[0]! >= 3 && sorted[1]! >= 2) || sorted[0] === 5 ? 25 : 0;
    }
    case 'smallStraight':
      return hasRun(dice, 4) ? 30 : 0;
    case 'largeStraight':
      return hasRun(dice, 5) ? 40 : 0;
    case 'fiveKind':
      return most === 5 ? 50 : 0;
    case 'chance':
      return sum(dice);
  }
}

/** Sum of the six upper-section boxes filled so far. */
export function upperTotal(card: Card): number {
  return UPPER_IDS.reduce((t, id) => t + (card[id] ?? 0), 0);
}

export function upperBonus(card: Card): number {
  return upperTotal(card) >= UPPER_TARGET ? UPPER_BONUS : 0;
}

export function grandTotal(card: Card): number {
  return CATEGORIES.reduce((t, c) => t + (card[c.id] ?? 0), 0) + upperBonus(card);
}
