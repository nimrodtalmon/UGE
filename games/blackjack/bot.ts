import { cardValue, total, type BCard } from './cards.js';

/**
 * What the counting bot is allowed to lean on. Both numbers are things anyone
 * sitting at the table can see: cards already turned face up (summed as a
 * Hi-Lo running count) and how thick the shoe still looks. The order of the
 * undealt cards, and the hole card before it is turned, are not in here.
 */
export interface SeenTable {
  runningCount: number;
  cardsLeft: number;
}

export type Action = 'hit' | 'stand' | 'double' | 'split';

export interface Spot {
  /** This bot's own cards. */
  cards: BCard[];
  /** The dealer's UP card — the only dealer card anybody can see yet. */
  dealerUp: BCard;
  canDouble: boolean;
  canSplit: boolean;
  level: string;
  random: () => number;
}

const between = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

/** Basic strategy for a pair, or null to play it as an ordinary total. */
function pairPlay(pairValue: number, up: number): boolean {
  switch (pairValue) {
    case 11: // aces
    case 8:
      return true;
    case 10:
    case 5:
      return false; // twenty and a hard ten are far too good to break up
    case 9:
      return between(up, 2, 6) || up === 8 || up === 9;
    case 7:
    case 3:
    case 2:
      return between(up, 2, 7);
    case 6:
      return between(up, 2, 6);
    case 4:
      return between(up, 5, 6);
    default:
      return false;
  }
}

/** Basic strategy, four decks, dealer stands on all 17s, doubling after split. */
function basic(spot: Spot): Action {
  const up = cardValue(spot.dealerUp.r);
  const { value, soft } = total(spot.cards);
  const first = spot.cards[0];
  const dbl = (want: boolean, fallback: Action): Action =>
    want && spot.canDouble ? 'double' : fallback;

  if (spot.canSplit && first && pairPlay(cardValue(first.r), up)) return 'split';

  if (soft) {
    if (value >= 19) return 'stand';
    if (value === 18) {
      if (between(up, 3, 6)) return dbl(true, 'stand');
      return between(up, 2, 8) ? 'stand' : 'hit';
    }
    if (value === 17) return dbl(between(up, 3, 6), 'hit');
    if (value >= 15) return dbl(between(up, 4, 6), 'hit');
    return dbl(between(up, 5, 6), 'hit'); // soft 13/14
  }

  if (value >= 17) return 'stand';
  if (value >= 13) return between(up, 2, 6) ? 'stand' : 'hit';
  if (value === 12) return between(up, 4, 6) ? 'stand' : 'hit';
  if (value === 11) return dbl(true, 'hit');
  if (value === 10) return dbl(between(up, 2, 9), 'hit');
  if (value === 9) return dbl(between(up, 3, 6), 'hit');
  return 'hit';
}

/** One decision for this hand. Pure, and never returns an illegal action. */
export function chooseAction(spot: Spot): Action {
  if (spot.level === 'easy') {
    // hits below seventeen and never thinks about the dealer's card
    return total(spot.cards).value < 17 ? 'hit' : 'stand';
  }
  const action = basic(spot);
  if (action === 'double' && !spot.canDouble) return 'hit';
  if (action === 'split' && !spot.canSplit) return 'hit';
  return action;
}

/** How much to put up this round. Only `sharp` lets the count move the stake. */
export function chooseBet(chips: number, minBet: number, level: string, table: SeenTable): number {
  const floor = Math.min(minBet, chips); // down to the felt: shove what is left
  // never stake more than a sixth of the stack — a bot that busts out early
  // stops being an opponent, and that is no fun for anybody
  const cap = Math.max(floor, Math.floor(chips / 6));
  const clamp = (n: number) => Math.max(floor, Math.min(Math.round(n), cap, chips));
  if (level === 'easy') return clamp(minBet);
  if (level !== 'sharp') return clamp(minBet * 2);
  // Hi-Lo: a shoe that has spat out its small cards is a shoe worth pressing.
  const decksLeft = Math.max(1, table.cardsLeft / 52);
  const trueCount = table.runningCount / decksLeft;
  const units = trueCount >= 3 ? 4 : trueCount >= 2 ? 3 : trueCount >= 1 ? 2 : 1;
  return clamp(minBet * 2 * units);
}
