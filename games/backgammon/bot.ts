import { legalSingleSteps, legalStep } from './game.js';
import type { BoardState, Seat, Step } from './game.js';

/**
 * A backgammon opponent that plays one die at a time — the platform asks again
 * for each die, so every call answers a single question: "which checker moves
 * next?". Easy plays at random; Normal scores each legal single step with a
 * checker-play heuristic (hit, make points, avoid leaving shots); Sharp adds a
 * one-ply look at the position each step leaves behind.
 *
 * All legality comes from the game's own `legalStep` / `legalSingleSteps`, so
 * the bot can never offer a move the rules would reject.
 */

const sgn = (seat: Seat): number => (seat === 0 ? 1 : -1);
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
const at = (points: number[], p: number): number => points[p] ?? 0;
/** Pip distance of point `p` from bearing off, 1..24, from `seat`'s side. */
const pip = (seat: Seat, p: number): number => (seat === 0 ? p + 1 : 24 - p);

/** Rolls out of 36 that cover a given distance, direct or in two dice. */
const SHOTS = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3];

/** The board after one legal step — the same bookkeeping as the `step` move. */
function applyStep(b: BoardState, seat: Seat, from: number, die: number): BoardState | null {
  const to = legalStep(b, seat, from, die);
  if (to === null) return null;
  const s = sgn(seat);
  const points = [...b.points];
  const bar: [number, number] = [b.bar[0], b.bar[1]];
  const borneOff: [number, number] = [b.borneOff[0], b.borneOff[1]];
  if (from === -1) bar[seat] -= 1;
  else points[from] = at(points, from) - s;
  if (to === 'off') {
    borneOff[seat] += 1;
  } else {
    if (at(points, to) === -s) {
      points[to] = 0; // the lone blot goes to the bar
      bar[other(seat)] += 1;
    }
    points[to] = at(points, to) + s;
  }
  return { points, bar, borneOff };
}

/**
 * Rough chance (0..1) that the opponent hits a blot of `victim`'s on point `p`
 * next roll. Counts the shot numbers for every distance an opposing checker
 * sits behind the blot; intervening blocked points are ignored, which is the
 * usual over-the-board approximation.
 */
function hitChance(b: BoardState, victim: Seat, p: number): number {
  const opp = other(victim);
  const distances: number[] = [];
  if (b.bar[opp] > 0) {
    // Stuck on the bar: only a direct entry onto the blot hits it.
    const d = opp === 0 ? 24 - p : p + 1;
    if (d >= 1 && d <= 6) distances.push(d);
  } else {
    for (let q = 0; q < 24; q++) {
      if (at(b.points, q) * sgn(opp) <= 0) continue;
      const d = opp === 0 ? q - p : p - q;
      if (d >= 1 && d <= 12) distances.push(d);
    }
  }
  if (distances.length === 0) return 0;
  const shots = distances.map((d) => SHOTS[d] ?? 0);
  const best = Math.max(...shots);
  // Extra sources add fewer new numbers than they own — count them cheaply.
  const extra = shots.reduce((sum, s) => sum + Math.min(s, 4), 0) - Math.min(best, 4);
  return Math.min(best + extra, 30) / 36;
}

/** Total exposure of `seat`'s blots: hit chance weighted by the pips a hit costs. */
function blotRisk(b: BoardState, seat: Seat): number {
  const s = sgn(seat);
  let risk = 0;
  for (let p = 0; p < 24; p++) {
    if (at(b.points, p) * s !== 1) continue;
    risk += hitChance(b, seat, p) * ((25 - pip(seat, p)) / 25);
  }
  return risk;
}

function pipCount(b: BoardState, seat: Seat): number {
  const s = sgn(seat);
  let total = b.bar[seat] * 25;
  for (let p = 0; p < 24; p++) {
    const n = at(b.points, p) * s;
    if (n > 0) total += n * pip(seat, p);
  }
  return total;
}

/** Points held (2+ checkers) inside `seat`'s own home board — the blocking game. */
function homePoints(b: BoardState, seat: Seat): number {
  const s = sgn(seat);
  let n = 0;
  for (let p = 0; p < 24; p++) {
    if (pip(seat, p) <= 6 && at(b.points, p) * s >= 2) n += 1;
  }
  return n;
}

/** What one step is worth on its own: hits, points made, shots left behind. */
function stepScore(b: BoardState, seat: Seat, step: Step): number {
  const s = sgn(seat);
  const opp = other(seat);
  const { from, die, to } = step;
  let score = 0;

  if (to === 'off') {
    score += 55; // a checker home and safe
  } else {
    const dest = at(b.points, to);
    if (dest === -s) {
      // A hit: the opponent loses every pip back to the bar.
      score += 45 + 2 * (25 - pip(opp, to));
    } else if (dest * s === 1) {
      score += 26; // two checkers on the point — a point made
      if (pip(seat, to) <= 9) score += 8; // and it blocks near our home
    } else if (dest * s >= 2) {
      score += 6; // safe, but stacking is dull
    }
  }
  if (from === -1) score += 12; // getting off the bar comes first
  // Running a back checker out of the opponent's home board is real progress.
  if (from >= 0 && pip(seat, from) > 18 && (to === 'off' || pip(seat, to) <= 18)) score += 10;

  const after = applyStep(b, seat, from, die);
  if (!after) return -Infinity;
  // Net change in exposure: covers a blot, or leaves one where it can be hit.
  score -= 35 * (blotRisk(after, seat) - blotRisk(b, seat));
  return score;
}

/** How good the whole position is for `seat`, one ply on (Sharp only). */
function positionScore(b: BoardState, seat: Seat): number {
  const opp = other(seat);
  let score = pipCount(b, opp) - pipCount(b, seat); // the race
  score += 4 * (b.borneOff[seat] - b.borneOff[opp]);
  score += 6 * (homePoints(b, seat) - homePoints(b, opp));
  score += 8 * (b.bar[opp] - b.bar[seat]); // being on the bar costs more than pips
  score -= 30 * blotRisk(b, seat);
  return score;
}

/**
 * Pick one legal step for `seat`, or null when there is none (the platform's
 * `step` move passes the turn on its own once nothing is playable).
 */
export function pickStep(b: BoardState, seat: Seat, dice: number[], level: string, random: () => number): Step | null {
  const steps = legalSingleSteps(b, seat, dice);
  if (steps.length === 0) return null;

  if (level === 'easy') {
    return steps[Math.min(steps.length - 1, Math.floor(random() * steps.length))] ?? null;
  }

  const sharp = level === 'sharp';
  let best: Step | null = null;
  let bestScore = -Infinity;
  for (const step of steps) {
    let score = stepScore(b, seat, step);
    if (sharp) {
      const after = applyStep(b, seat, step.from, step.die);
      if (!after) continue;
      score += 3 * positionScore(after, seat);
      score += random() * 3; // jitter, so it doesn't play one line forever
    } else {
      score += random() * 0.5; // tie-break only
    }
    if (score > bestScore) {
      bestScore = score;
      best = step;
    }
  }
  return best ?? steps[0] ?? null;
}
