import type { BotMove } from '../../src/shared/plugin.js';
import { fullSet, halves, isDouble, legalPlays, outerOf, pipsOf, type End } from './tiles.js';

/**
 * Everything the AI is allowed to know — exactly what a person sitting in that
 * seat can see: their own tiles, the two open ends, the tiles already laid on
 * the line, how many tiles everyone else is holding, how many tiles are left in
 * the boneyard (a count, never its contents), and which numbers each seat has
 * publicly passed on. No other hand and no undrawn tile ever enters this object.
 */
export interface Knowledge {
  seat: number;
  hand: string[];
  left: number;
  right: number;
  /** Tile ids already played, face up, in front of everyone. */
  chain: string[];
  /** Tiles left in the boneyard — the count is public, the tiles are not. */
  boneyard: number;
  counts: number[];
  /** Per seat: numbers that seat could not match when it passed. */
  passedOn: number[][];
}

interface Option {
  id: string;
  end: End;
}

/** Weight shed, doubles unloaded early, and the end that suits your hand. */
const PIP_WEIGHT = 1;
const DOUBLE_BONUS = 6;
const SUIT_BONUS = 1.5;
/** Sharp only: an end nobody else can answer. */
const VOID_BONUS = 4;
const SCARCITY_BONUS = 4;

/** How well an option serves the hand — bigger is better. */
function score(o: Option, k: Knowledge, level: string): number {
  const target = o.end === 'left' ? k.left : k.right;
  const outer = outerOf(o.id, o.end, target);
  const newLeft = o.end === 'left' ? outer : k.left;
  const newRight = o.end === 'right' ? outer : k.right;
  const rest = k.hand.filter((id) => id !== o.id);
  const carries = (id: string, n: number) => {
    const [p, q] = halves(id);
    return p === n || q === n;
  };

  // shed weight: an unplayed heavy tile is what loses a blocked game
  let s = PIP_WEIGHT * pipsOf(o.id);
  // a double answers one number only, so it is the tile most likely to strand
  // you at the end — get it down while the line still takes it
  if (isDouble(o.id)) s += DOUBLE_BONUS;
  // leave open the numbers you are strongest in: an end you can answer again
  // is an end that keeps your turn alive
  s += SUIT_BONUS * (rest.filter((id) => carries(id, newLeft)).length + rest.filter((id) => carries(id, newRight)).length);

  if (level === 'sharp') {
    // Public information only. Two kinds:
    // 1. a seat that passed showed everyone it holds neither open number
    let voids = 0;
    k.passedOn.forEach((nums, i) => {
      if (i === k.seat) return;
      if (nums.includes(newLeft)) voids++;
      if (nums.includes(newRight)) voids++;
    });
    s += VOID_BONUS * voids;
    // 2. everything on the line is face up and everything in hand is mine, so
    //    the rest of the set is countable: an end whose number has few tiles
    //    left unaccounted for is an end few people can answer
    const seen = new Set([...k.hand, ...k.chain]);
    const unseen = (n: number) =>
      fullSet().filter((id) => !seen.has(id) && carries(id, n)).length;
    s -= SCARCITY_BONUS * (unseen(newLeft) + unseen(newRight));
  }
  return s;
}

/** One move for this seat: play a tile, draw, or pass. Never throws. */
export function decide(k: Knowledge, level: string, random: () => number): BotMove {
  const plays = legalPlays(k.hand, k.left, k.right);
  if (plays.length === 0) return k.boneyard > 0 ? { name: 'draw' } : { name: 'pass' };

  const options: Option[] = plays.flatMap((p) => p.ends.map((end) => ({ id: p.id, end })));
  const first = options[0]!;
  if (level === 'easy') return { name: 'play', args: [first.id, first.end] };

  let best = first;
  let bestScore = -Infinity;
  for (const o of options) {
    // a whisker of noise so two equal tiles are not always the same one
    const s = score(o, k, level) + random() * 0.4;
    if (s > bestScore) {
      bestScore = s;
      best = o;
    }
  }
  return { name: 'play', args: [best.id, best.end] };
}
