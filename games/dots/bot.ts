/**
 * Dots & Boxes AI.
 *
 *   easy   — any free edge.
 *   normal — takes free boxes, otherwise never draws a third side; when every
 *            edge gives something away it gives away the least.
 *   sharp  — normal's instincts plus the part that actually decides the game:
 *            chain control. It searches the capture/decline lines exactly
 *            (they are nearly forced, so the tree is small), scores quiet
 *            positions by decomposing what is left into chains and loops and
 *            playing the standard hand-back through them, and solves the last
 *            stretch of the board outright.
 *
 * Pure throughout: the only randomness is the ctx.random handed in.
 */

import {
  boxCount,
  boxesOfEdge,
  drawEdge,
  edgesOfBox,
  freeEdges,
  sidesOf,
} from './rules.js';

/** Free edges left when the endgame is solved outright instead of estimated. */
const SOLVE_FROM = 14;
/** Hard cap on search nodes per call, so a big board can never stall a turn. */
const NODE_BUDGET = 60_000;
/** Lines left in the attacked region before declining it is even considered. */
const DECLINE_FROM = 5;

const gainOf = (n: number, taken: boolean[], e: number): number =>
  drawEdge(n, taken, e).closed.length;

/** Does drawing this edge leave a box on three sides — a present, in short. */
function opensSomething(n: number, taken: boolean[], e: number): boolean {
  const next = taken.slice();
  next[e] = true;
  return boxesOfEdge(n, e).some((b) => sidesOf(n, next, b) === 3);
}

/**
 * Free edges of the region currently under attack: start from every box on
 * three sides and walk out through undrawn edges. This is the handful of
 * lines the chain is being eaten along, and the only place where handing the
 * rest back can ever be the right move.
 */
function openRegionEdges(n: number, taken: boolean[]): number[] {
  const seen = new Set<number>();
  const stack: number[] = [];
  for (let b = 0; b < boxCount(n); b++) {
    if (sidesOf(n, taken, b) === 3) {
      seen.add(b);
      stack.push(b);
    }
  }
  const edges = new Set<number>();
  while (stack.length > 0) {
    const b = stack.pop()!;
    for (const e of edgesOfBox(n, b)) {
      if (taken[e] === true) continue;
      edges.add(e);
      for (const other of boxesOfEdge(n, e)) {
        if (other !== b && !seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
  }
  return [...edges];
}

/** Any box sitting on three sides right now. */
function anyCapturable(n: number, taken: boolean[]): boolean {
  for (let b = 0; b < boxCount(n); b++) if (sidesOf(n, taken, b) === 3) return true;
  return false;
}

/** Take every box on offer, one after another; how many, and what is left. */
function eatAll(n: number, taken: boolean[]): { gain: number; taken: boolean[] } {
  let board = taken;
  let gain = 0;
  for (;;) {
    const move = freeEdges(board).find((e) => gainOf(n, board, e) > 0);
    if (move === undefined) return { gain, taken: board };
    const step = drawEdge(n, board, move);
    gain += step.closed.length;
    board = step.taken;
  }
}

/** Boxes the opponent collects if they simply eat everything this move opens. */
function giveaway(n: number, taken: boolean[], e: number): number {
  return eatAll(n, drawEdge(n, taken, e).taken).gain;
}

/* ---------------------------------------------------------------- chains */

interface Region {
  boxes: number;
  /** No way out to the edge of the board: a closed loop. */
  loop: boolean;
}

/**
 * Split what is left of the board into independent regions. Unclosed boxes
 * are the nodes; undrawn edges between two of them are the links, undrawn
 * edges on the outside are ways in. A region nobody can enter is a loop.
 */
function regions(n: number, taken: boolean[]): Region[] {
  const total = boxCount(n);
  const seen = new Array<boolean>(total).fill(false);
  const out: Region[] = [];
  for (let start = 0; start < total; start++) {
    if (seen[start] || sidesOf(n, taken, start) === 4) continue;
    const stack = [start];
    seen[start] = true;
    let boxes = 0;
    let ways = 0;
    while (stack.length > 0) {
      const b = stack.pop()!;
      boxes++;
      for (const e of edgesOfBox(n, b)) {
        if (taken[e] === true) continue;
        const others = boxesOfEdge(n, e).filter((x) => x !== b);
        const other = others[0];
        if (other === undefined) {
          ways++; // an undrawn edge on the rim of the board
          continue;
        }
        if (!seen[other]) {
          seen[other] = true;
          stack.push(other);
        }
      }
    }
    out.push({ boxes, loop: ways === 0 });
  }
  return out;
}

/**
 * Value of a quiet position (nothing capturable) for the player to move, in
 * boxes. Standard play: whoever must open a region hands it over, and the
 * taker gives the last two back (four, in a loop) to stay out of the opening
 * seat — so short regions go first and control is what is really being
 * traded. The last region is simply eaten whole.
 */
function quietValue(n: number, taken: boolean[]): number {
  const list = regions(n, taken).sort((a, b) => a.boxes - b.boxes);
  let net = 0;
  let opener = 0; // 0 = the player to move opens, 1 = the other one does
  for (let i = 0; i < list.length; i++) {
    const region = list[i]!;
    const taker = opener === 0 ? 1 : 0;
    const keep = region.loop ? 4 : 2;
    const worthDeclining = i < list.length - 1 && region.boxes >= (region.loop ? 4 : 3);
    const sign = (who: number): number => (who === 0 ? 1 : -1);
    if (worthDeclining) {
      net += sign(taker) * (region.boxes - keep) + sign(opener) * keep;
    } else {
      net += sign(taker) * region.boxes;
      opener = taker; // control changed hands
    }
  }
  return net;
}

/* ---------------------------------------------------------------- search */

interface Search {
  n: number;
  memo: Map<string, number>;
  budget: number;
}

const keyOf = (taken: boolean[]): string => {
  let s = '';
  for (const t of taken) s += t ? '1' : '0';
  return s;
};

/**
 * The moves worth looking at. In the capture phase this is tiny — a free box
 * with nothing behind it is forced, and declining only ever pays on the last
 * few edges of the open region — which is what keeps the search cheap.
 */
function candidates(s: Search, taken: boolean[]): number[] {
  const free = freeEdges(taken);
  const caps = free.filter((e) => gainOf(s.n, taken, e) > 0);
  if (caps.length > 0) {
    const clean = caps.filter((e) => !opensSomething(s.n, taken, e));
    if (clean.length > 0) return [clean[0]!]; // a free box costing nothing: forced
    // eating into a region: once it is down to its last few lines, handing
    // the rest back to keep the opening seat may beat swallowing it whole
    const region = openRegionEdges(s.n, taken);
    const decline = region.length <= DECLINE_FROM ? region.filter((e) => !caps.includes(e)) : [];
    return [...caps, ...decline];
  }
  const safe = free.filter((e) => !opensSomething(s.n, taken, e));
  if (safe.length > 0) return safe;
  // everything gives something away: only the cheapest openings are worth it
  const ranked = free
    .map((e) => ({ e, cost: giveaway(s.n, taken, e) }))
    .sort((a, b) => a.cost - b.cost);
  return ranked.slice(0, 4).map((r) => r.e);
}

/** Boxes the player to move ends up ahead by, with both sides playing on. */
function value(s: Search, taken: boolean[]): number {
  const free = freeEdges(taken);
  if (free.length === 0) return 0;
  if (s.budget <= 0) return quietValue(s.n, taken);
  // a quiet position with plenty of board left is estimated, not searched
  if (free.length > SOLVE_FROM && !anyCapturable(s.n, taken)) return quietValue(s.n, taken);

  const key = keyOf(taken);
  const cached = s.memo.get(key);
  if (cached !== undefined) return cached;
  s.budget--;

  let best = -Infinity;
  for (const e of candidates(s, taken)) {
    const step = drawEdge(s.n, taken, e);
    const gain = step.closed.length;
    // closing a box means another turn, so the score stays on this side
    const v = gain > 0 ? gain + value(s, step.taken) : -value(s, step.taken);
    if (v > best) best = v;
  }
  s.memo.set(key, best);
  return best;
}

/* ------------------------------------------------------------------ pick */

const randomOf = (list: number[], random: () => number): number =>
  list[Math.floor(random() * list.length) % list.length] ?? list[0]!;

function greedy(n: number, taken: boolean[], random: () => number): number {
  const free = freeEdges(taken);
  const caps = free.filter((e) => gainOf(n, taken, e) > 0);
  if (caps.length > 0) {
    const clean = caps.filter((e) => !opensSomething(n, taken, e));
    return randomOf(clean.length > 0 ? clean : caps, random);
  }
  const safe = free.filter((e) => !opensSomething(n, taken, e));
  if (safe.length > 0) return randomOf(safe, random);
  // forced to open something: open the smallest thing on the board
  let best = free[0]!;
  let bestCost = Infinity;
  for (const e of free) {
    const cost = giveaway(n, taken, e) + random() * 0.5;
    if (cost < bestCost) {
      bestCost = cost;
      best = e;
    }
  }
  return best;
}

/**
 * Pick an edge for the bot. Never returns an edge that is already drawn, and
 * only returns null when the board is full.
 */
export function pickEdge(
  n: number,
  taken: boolean[],
  level: string,
  random: () => number,
): number | null {
  const free = freeEdges(taken);
  if (free.length === 0) return null;
  if (free.length === 1) return free[0]!;
  if (level === 'easy') return randomOf(free, random);
  if (level !== 'sharp') return greedy(n, taken, random);

  const s: Search = { n, memo: new Map(), budget: NODE_BUDGET };
  const caps = free.filter((e) => gainOf(n, taken, e) > 0);
  const clean = caps.filter((e) => !opensSomething(n, taken, e));
  if (clean.length > 0) return clean[0]!; // free box, nothing behind it

  // quiet and still roomy: shape the board rather than search it — pick the
  // safe edge that leaves the opponent the worst set of chains to open.
  if (caps.length === 0 && free.length > SOLVE_FROM) {
    const safe = free.filter((e) => !opensSomething(n, taken, e));
    if (safe.length > 0) {
      let best = safe[0]!;
      let bestScore = Infinity;
      for (const e of safe) {
        const score = quietValue(n, drawEdge(n, taken, e).taken) + random() * 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      return best;
    }
  }

  const options = candidates(s, taken);
  let best = options[0] ?? free[0]!;
  let bestValue = -Infinity;
  for (const e of options) {
    const step = drawEdge(n, taken, e);
    const gain = step.closed.length;
    const v = (gain > 0 ? gain + value(s, step.taken) : -value(s, step.taken)) + random() * 0.01;
    if (v > bestValue) {
      bestValue = v;
      best = e;
    }
  }
  return taken[best] === true ? randomOf(free, random) : best;
}
