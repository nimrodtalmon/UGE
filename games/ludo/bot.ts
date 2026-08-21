import {
  BASE,
  HOME,
  HOME_COL,
  RING,
  SAFE,
  destinationOf,
  legalTokens,
  occupantsOf,
  ownOn,
  ringSquare,
} from './game.js';
import type { LudoState } from './game.js';

/**
 * A Ludo opponent. The die is already on the table when this is called, so the
 * only question is which token plays it.
 *
 *  - easy   picks a legal token at random;
 *  - normal ranks the outcome: a capture, then a token coming home, then one
 *           leaving the base, then plain progress;
 *  - sharp  adds risk — it counts the enemy dice that would reach the square it
 *           lands on, likes squares where it already stands (a block), and
 *           prefers to move whichever token is most exposed right now.
 *
 * Legality always comes from the game's own `legalTokens` / `destinationOf`,
 * so the bot can never offer a move the rules would reject. Ludo hides
 * nothing, so reading the state is reading the board.
 */

const isSafe = (a: number): boolean => SAFE.includes(a);

/**
 * How many enemy tokens sit 1..6 squares behind ring square `a` and could
 * therefore land on it with one die. Tokens that would turn into their own
 * home column before reaching `a` cannot, and safe squares are never hit.
 */
function danger(state: LudoState, seat: number, a: number): number {
  if (isSafe(a)) return 0;
  let shots = 0;
  state.tokens.forEach((row, other) => {
    if (other === seat) return;
    const q = state.colours[other] ?? 0;
    for (const t of row) {
      if (t < 0 || t >= RING) continue;
      const gap = (a - ringSquare(q, t) + RING) % RING;
      if (gap >= 1 && gap <= 6 && t + gap < RING) shots += 1;
    }
  });
  return shots;
}

/** Exposure of a token that already stands somewhere (0 in base or home). */
function riskAt(state: LudoState, seat: number, t: number): number {
  if (t < 0 || t >= RING) return 0;
  return danger(state, seat, ringSquare(state.colours[seat] ?? 0, t));
}

/** What the move is worth before any risk is weighed in. */
function baseScore(state: LudoState, seat: number, index: number, to: number): number {
  const from = state.tokens[seat]?.[index] ?? BASE;
  let score = to * 0.5; // plain progress

  if (to === HOME) score += 90;
  else if (to >= HOME_COL) score += 45; // safe inside the home column
  if (from === BASE) score += 55; // a token in the base does nothing at all

  if (to < RING) {
    const a = ringSquare(state.colours[seat] ?? 0, to);
    const victims = isSafe(a) ? 0 : occupantsOf(state, a, seat).length;
    if (victims > 0) {
      // a capture is worth however far the victim had come
      const [victim, tokenIndex] = occupantsOf(state, a, seat)[0]!;
      const lost = state.tokens[victim]?.[tokenIndex] ?? 0;
      score += 100 + lost;
    }
  }
  return score;
}

/**
 * The token to play `die` with, or null when nothing is legal (the roll move
 * already passes the turn in that case, so this should not happen).
 */
export function pickToken(
  state: LudoState,
  seat: number,
  die: number,
  level: string,
  random: () => number,
): number | null {
  const legal = legalTokens(state, seat, die);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;

  if (level === 'easy') {
    return legal[Math.min(legal.length - 1, Math.floor(random() * legal.length))]!;
  }

  const sharp = level === 'sharp';
  let best = legal[0]!;
  let bestScore = -Infinity;
  for (const index of legal) {
    const to = destinationOf(state, seat, index, die);
    if (to === null) continue;
    let score = baseScore(state, seat, index, to);

    if (sharp) {
      const from = state.tokens[seat]?.[index] ?? BASE;
      // don't park 1..6 squares in front of an enemy
      if (to < RING) {
        const a = ringSquare(state.colours[seat] ?? 0, to);
        score -= 16 * danger(state, seat, a);
        // landing where we already stand makes a block enemies cannot enter
        if (!isSafe(a) && ownOn(state, seat, a) >= 1) score += 20;
        if (isSafe(a)) score += 10;
      }
      // getting the most exposed token out of trouble is worth real points
      score += 14 * riskAt(state, seat, from);
      score += random() * 4;
    } else {
      score += random() * 0.5; // tie-break only
    }

    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}
