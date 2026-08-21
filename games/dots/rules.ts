/**
 * Dots & Boxes geometry. Pure and JSON-able; shared by game.ts, bot.ts and
 * the views.
 *
 * A board is `n` × `n` dots, so (n-1) × (n-1) boxes. Edges live in one flat
 * array: the horizontal ones first (n rows of n-1), then the vertical ones
 * ((n-1) rows of n). Boxes are row-major, index r*(n-1)+c.
 *
 *   H(r,c) = r*(n-1) + c              r in 0..n-1, c in 0..n-2
 *   V(r,c) = n*(n-1) + r*n + c        r in 0..n-2, c in 0..n-1
 */

export const MIN_DOTS = 3;
export const MAX_DOTS = 9;

export const edgeCount = (n: number): number => 2 * n * (n - 1);
export const boxCount = (n: number): number => (n - 1) * (n - 1);
const hCount = (n: number): number => n * (n - 1);

export const isHorizontal = (n: number, e: number): boolean => e < hCount(n);

/** Grid position of an edge, for the views' CSS grid placement. */
export interface EdgeSpot {
  horizontal: boolean;
  row: number;
  col: number;
}

export function edgeSpot(n: number, e: number): EdgeSpot {
  if (e < hCount(n)) {
    return { horizontal: true, row: Math.floor(e / (n - 1)), col: e % (n - 1) };
  }
  const k = e - hCount(n);
  return { horizontal: false, row: Math.floor(k / n), col: k % n };
}

/** The four edges around a box: top, bottom, left, right. */
export function edgesOfBox(n: number, b: number): [number, number, number, number] {
  const r = Math.floor(b / (n - 1));
  const c = b % (n - 1);
  const h = hCount(n);
  return [r * (n - 1) + c, (r + 1) * (n - 1) + c, h + r * n + c, h + r * n + c + 1];
}

/** The one or two boxes an edge borders (border edges have only one). */
export function boxesOfEdge(n: number, e: number): number[] {
  const spot = edgeSpot(n, e);
  const out: number[] = [];
  if (spot.horizontal) {
    if (spot.row > 0) out.push((spot.row - 1) * (n - 1) + spot.col);
    if (spot.row < n - 1) out.push(spot.row * (n - 1) + spot.col);
  } else {
    if (spot.col > 0) out.push(spot.row * (n - 1) + spot.col - 1);
    if (spot.col < n - 1) out.push(spot.row * (n - 1) + spot.col);
  }
  return out;
}

/** How many of a box's four edges are drawn. */
export function sidesOf(n: number, taken: boolean[], b: number): number {
  let sides = 0;
  for (const e of edgesOfBox(n, b)) if (taken[e] === true) sides++;
  return sides;
}

export function freeEdges(taken: boolean[]): number[] {
  const out: number[] = [];
  for (let e = 0; e < taken.length; e++) if (taken[e] !== true) out.push(e);
  return out;
}

export interface Drawn {
  taken: boolean[];
  /** Boxes closed by this edge (0, 1 or 2). */
  closed: number[];
}

/**
 * Draw one edge. The caller must have checked it is free — this never mutates
 * its input and never validates ownership; game.ts does that.
 */
export function drawEdge(n: number, taken: boolean[], e: number): Drawn {
  const next = taken.slice();
  next[e] = true;
  const closed = boxesOfEdge(n, e).filter((b) => sidesOf(n, next, b) === 4);
  return { taken: next, closed };
}

/** Boxes that are one edge away from being closed. */
export function capturableBoxes(n: number, taken: boolean[]): number[] {
  const out: number[] = [];
  for (let b = 0; b < boxCount(n); b++) if (sidesOf(n, taken, b) === 3) out.push(b);
  return out;
}

/** Mode config is opaque JSON from the lobby — clamp whatever arrives. */
export function dotsFromConfig(config: Record<string, unknown>, fallback: number): number {
  const raw = config['dots'];
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= MIN_DOTS && raw <= MAX_DOTS) {
    return raw;
  }
  return fallback;
}
