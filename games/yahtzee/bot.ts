import { CATEGORIES, UPPER_TARGET, scoreFor, upperTotal } from './scoring.js';
import type { Card, CategoryId } from './scoring.js';

/**
 * A dice-game opponent. Everything here is public information — the dice on
 * the table and the scorecards — so there is nothing to hide from; the levels
 * differ only in how well they play it.
 *
 * Easy rerolls everything until the rolls run out, then writes the biggest
 * number it can see. Normal keeps the most common face (or a partial straight
 * when that is worth more) and refuses to burn a big box on a bad hand. Sharp
 * plays Normal plus the upper bonus: it chases 63 while 63 is still reachable
 * and keeps five-of-a-kind open for as long as it has anywhere else to write.
 */

/** counts[f] = how many dice show face f (1..6). */
function counts(dice: number[]): number[] {
  const byFace = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) if (d >= 1 && d <= 6) byFace[d] = byFace[d]! + 1;
  return byFace;
}

/** The upper box that counts a given face. */
const UPPER_BY_FACE: CategoryId[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

/** The longest run of consecutive distinct faces present in the dice. */
function bestRun(dice: number[]): number[] {
  const byFace = counts(dice);
  let best: number[] = [];
  let run: number[] = [];
  for (let f = 1; f <= 6; f++) {
    if (byFace[f]! > 0) {
      run.push(f);
      if (run.length > best.length) best = [...run];
    } else {
      run = [];
    }
  }
  return best;
}

/** Can the upper section still reach 63 with the boxes that are still open? */
export function bonusReachable(card: Card): boolean {
  let ceiling = upperTotal(card);
  UPPER_BY_FACE.forEach((id, i) => {
    if (card[id] === null) ceiling += 5 * (i + 1);
  });
  return ceiling >= UPPER_TARGET;
}

/** Points still needed for the 63 bonus (0 once it is in the bag or gone). */
function bonusGap(card: Card): number {
  if (!bonusReachable(card)) return 0;
  return Math.max(0, UPPER_TARGET - upperTotal(card));
}

const holdFace = (dice: number[], face: number): boolean[] => dice.map((d) => d === face);

/** Hold one die per face of the run — extra copies are free to reroll. */
function holdRun(dice: number[], run: number[]): boolean[] {
  const used = new Set<number>();
  return dice.map((d) => {
    if (run.includes(d) && !used.has(d)) {
      used.add(d);
      return true;
    }
    return false;
  });
}

/** How much a set of `n` dice showing `face` is worth keeping. */
function kindValue(face: number, n: number, card: Card, level: string): number {
  let value = n * 12 + face;
  if (level === 'sharp') {
    const upper = UPPER_BY_FACE[face - 1]!;
    // chase the bonus while it is still live, and only in a box we still hold
    if (card[upper] === null && bonusGap(card) > 0 && n >= 2) value += face * 3;
    if (card['fiveKind'] === null && n >= 4) value += 6;
  }
  return value;
}

/**
 * Which dice to keep for the next roll. Pure and stable: the platform calls
 * the bot once a second and it toggles one hold per call, so the same dice
 * must always produce the same answer or the holds would never settle.
 */
export function planHolds(dice: number[], card: Card, level: string): boolean[] {
  const none = [false, false, false, false, false];
  if (dice.some((d) => d < 1)) return none;
  if (level === 'easy') return none; // easy just throws them all again

  const byFace = counts(dice);
  let best = none;
  let bestValue = 0;

  for (let face = 1; face <= 6; face++) {
    const n = byFace[face]!;
    if (n < 2) continue;
    const value = kindValue(face, n, card, level);
    if (value > bestValue) {
      bestValue = value;
      best = holdFace(dice, face);
    }
  }

  // a made full house is worth more than the trips alone — keep all five
  const sorted = [...byFace.slice(1)].sort((a, b) => b - a);
  if (card['fullHouse'] === null && sorted[0] === 3 && sorted[1] === 2 && bestValue < 60) {
    bestValue = 60;
    best = [true, true, true, true, true];
  }

  const run = bestRun(dice);
  const straightOpen = card['smallStraight'] === null || card['largeStraight'] === null;
  if (straightOpen && run.length >= 3) {
    const value = run.length >= 5 ? 100 : run.length === 4 ? 45 : 24;
    if (value > bestValue) {
      bestValue = value;
      best = holdRun(dice, run);
    }
  }

  return best;
}

/** What each box is worth when it goes well — used to spend cheap boxes first. */
const POTENTIAL: Record<CategoryId, number> = {
  ones: 3,
  twos: 6,
  threes: 9,
  fours: 12,
  fives: 15,
  sixes: 18,
  threeKind: 22,
  fourKind: 24,
  fullHouse: 25,
  smallStraight: 30,
  largeStraight: 40,
  fiveKind: 50,
  chance: 22,
};

/** The score below which writing here is a waste of the box. */
function minAcceptable(id: CategoryId, card: Card, level: string): number {
  const face = UPPER_BY_FACE.indexOf(id) + 1;
  if (face > 0) {
    // three of a face keeps the 63 pace; two is enough once the bonus is gone
    const chasing = level === 'sharp' && bonusGap(card) > 0;
    return chasing ? 3 * face : 2 * face;
  }
  switch (id) {
    case 'threeKind':
      return 16;
    case 'fourKind':
      return 20;
    case 'chance':
      return level === 'sharp' ? 22 : 20;
    default:
      return 1; // all-or-nothing boxes: only write them when they actually hit
  }
}

/**
 * Sharp only: what a box is worth beyond its face points. An upper box filled
 * at the 63 pace (three of its face) is worth more than the number in it,
 * because it carries the 35 point bonus with it.
 */
function premium(id: CategoryId, points: number, card: Card, level: string): number {
  if (level !== 'sharp') return 0;
  const face = UPPER_BY_FACE.indexOf(id) + 1;
  return face > 0 && bonusGap(card) > 0 && points >= 3 * face ? 12 : 0;
}

/** Where to write a hand nothing fits — cheapest box first, big boxes last. */
const DUMP_ORDER: CategoryId[] = [
  'ones',
  'twos',
  'threes',
  'fourKind',
  'fullHouse',
  'smallStraight',
  'fours',
  'largeStraight',
  'fives',
  'threeKind',
  'chance',
  'sixes',
  'fiveKind',
];

/** The box to write the current dice into. Always an open one. */
export function pickCategory(dice: number[], card: Card, level: string): CategoryId {
  const open = CATEGORIES.filter((c) => card[c.id] === null).map((c) => c.id);
  if (open.length === 0) return 'chance'; // unreachable: the turn only runs on an open card
  const scored = open.map((id) => ({ id, points: scoreFor(id, dice) }));

  if (level === 'easy') {
    return scored.reduce((a, b) => (b.points > a.points ? b : a)).id;
  }

  const worth = scored
    .filter((x) => x.points >= minAcceptable(x.id, card, level))
    .map((x) => ({ ...x, value: x.points + premium(x.id, x.points, card, level) }));
  if (worth.length > 0) {
    // best value, and on a tie spend the box with the least left to give
    return worth.reduce((a, b) =>
      b.value > a.value || (b.value === a.value && POTENTIAL[b.id] < POTENTIAL[a.id]) ? b : a,
    ).id;
  }
  return DUMP_ORDER.find((id) => card[id] === null) ?? open[0]!;
}
