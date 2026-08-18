/** Pure poker helpers: cards, 7-card hand evaluation, side-pot distribution. */

export interface PCard {
  r: number; // 2..14 (14 = ace)
  s: number; // 0..3
}

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankLabel = (r: number) => RANKS[r] ?? String(r);

export function buildDeck(): PCard[] {
  const deck: PCard[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ r, s });
  return deck;
}

export const HAND_NAMES = [
  'high card',
  'a pair',
  'two pair',
  'three of a kind',
  'a straight',
  'a flush',
  'a full house',
  'four of a kind',
  'a straight flush',
];

/** Highest straight top-rank in a set of unique ranks (ace plays low too), or 0. */
function bestStraight(uniqueRanks: number[]): number {
  const set = new Set(uniqueRanks);
  if (set.has(14)) set.add(1);
  const arr = [...set].sort((a, b) => b - a);
  let run = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1]! - arr[i]! === 1) {
      run++;
      if (run >= 5) return arr[i]! + 4;
    } else {
      run = 1;
    }
  }
  return 0;
}

/** Score a 7-card hand as a lexicographically comparable array (bigger = better). */
export function evaluate7(cards: PCard[]): number[] {
  const ranks = cards.map((c) => c.r);
  const byRank = new Map<number, number>();
  for (const r of ranks) byRank.set(r, (byRank.get(r) ?? 0) + 1);
  const bySuit = new Map<number, PCard[]>();
  for (const c of cards) bySuit.set(c.s, [...(bySuit.get(c.s) ?? []), c]);
  const flushCards = [...bySuit.values()].find((v) => v.length >= 5);
  const uniqDesc = [...new Set(ranks)].sort((a, b) => b - a);

  if (flushCards) {
    const sf = bestStraight([...new Set(flushCards.map((c) => c.r))]);
    if (sf) return [8, sf];
  }
  const groups = [...byRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const kickers = (excl: number[], n: number) =>
    uniqDesc.filter((r) => !excl.includes(r)).slice(0, n);

  if (groups[0]![1] === 4) return [7, groups[0]![0], ...kickers([groups[0]![0]], 1)];
  if (groups[0]![1] === 3 && groups[1] && groups[1][1] >= 2) {
    return [6, groups[0]![0], groups[1][0]];
  }
  if (flushCards) {
    return [5, ...flushCards.map((c) => c.r).sort((a, b) => b - a).slice(0, 5)];
  }
  const st = bestStraight(uniqDesc);
  if (st) return [4, st];
  if (groups[0]![1] === 3) return [3, groups[0]![0], ...kickers([groups[0]![0]], 2)];
  if (groups[0]![1] === 2 && groups[1] && groups[1][1] === 2) {
    const [hi, lo] = [groups[0]![0], groups[1][0]].sort((a, b) => b - a) as [number, number];
    return [2, hi, lo, ...kickers([hi, lo], 1)];
  }
  if (groups[0]![1] === 2) return [1, groups[0]![0], ...kickers([groups[0]![0]], 3)];
  return [0, ...uniqDesc.slice(0, 5)];
}

export function cmpEval(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Split the pot(s). contrib = each seat's total chips put in this hand;
 * contenders = seats eligible to win (not folded); score = their hand score.
 * Uncalled excess is refunded. Returns per-seat gains (the whole pot is paid out).
 */
export function distributePots(
  contrib: number[],
  contenders: number[],
  score: (seat: number) => number[],
): number[] {
  const gains = contrib.map(() => 0);
  const cap = Math.max(...contenders.map((i) => contrib[i]!));
  const capped = contrib.map((c, i) => {
    const over = Math.max(0, c - cap);
    gains[i]! += over; // refund anything nobody could call
    return c - over;
  });
  const levels = [...new Set(contenders.map((i) => capped[i]!).filter((c) => c > 0))].sort(
    (a, b) => a - b,
  );
  let prev = 0;
  for (const level of levels) {
    const pot = capped.reduce((sum, c) => sum + Math.max(0, Math.min(c, level) - prev), 0);
    const eligible = contenders.filter((i) => capped[i]! >= level);
    let best: number[] = [];
    let winners: number[] = [];
    for (const i of eligible) {
      const s = score(i);
      const d = cmpEval(s, best);
      if (d > 0 || winners.length === 0) {
        best = s;
        winners = [i];
      } else if (d === 0) {
        winners.push(i);
      }
    }
    const share = Math.floor(pot / winners.length);
    let rest = pot - share * winners.length;
    for (const w of winners) {
      gains[w]! += share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
    }
    prev = level;
  }
  return gains;
}
