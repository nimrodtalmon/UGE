/**
 * The double-six set. A tile is identified by a stable id `"lo-hi"` (0-0 …
 * 6-6, 28 of them), so moves can name a tile without carrying its object.
 * Placed tiles also record which half faces left and which faces right.
 */

export type End = 'left' | 'right';

/** A tile as it sits in the line: `a` is its left half, `b` its right half. */
export interface Placed {
  id: string;
  a: number;
  b: number;
}

export const MAX_PIP = 6;

export function fullSet(): string[] {
  const ids: string[] = [];
  for (let a = 0; a <= MAX_PIP; a++) for (let b = a; b <= MAX_PIP; b++) ids.push(`${a}-${b}`);
  return ids;
}

/** The two halves of a tile id. Only ever called on ids that came from fullSet(). */
export function halves(id: string): [number, number] {
  const parts = id.split('-');
  return [Number(parts[0]), Number(parts[1])];
}

export function pipsOf(id: string): number {
  const [a, b] = halves(id);
  return a + b;
}

export function isDouble(id: string): boolean {
  const [a, b] = halves(id);
  return a === b;
}

export function handPips(hand: string[]): number {
  return hand.reduce((sum, id) => sum + pipsOf(id), 0);
}

/** Which ends a tile could go on, given the two open numbers. */
export function endsFor(id: string, left: number, right: number): End[] {
  const [a, b] = halves(id);
  const out: End[] = [];
  if (a === left || b === left) out.push('left');
  if (a === right || b === right) out.push('right');
  return out;
}

/** Every legal placement in a hand, in hand order. */
export function legalPlays(
  hand: string[],
  left: number,
  right: number,
): { id: string; ends: End[] }[] {
  return hand.flatMap((id) => {
    const ends = endsFor(id, left, right);
    return ends.length > 0 ? [{ id, ends }] : [];
  });
}

/** Orient a tile so the matching half touches the line, and return it placed. */
export function orient(id: string, end: End, target: number): Placed {
  const [a, b] = halves(id);
  // playing left: the tile's right half must meet the line's left end
  // playing right: the tile's left half must meet the line's right end
  if (end === 'left') return b === target ? { id, a, b } : { id, a: b, b: a };
  return a === target ? { id, a, b } : { id, a: b, b: a };
}

/** The half that ends up pointing outwards — the new open number on that side. */
export function outerOf(id: string, end: End, target: number): number {
  const placed = orient(id, end, target);
  return end === 'left' ? placed.a : placed.b;
}

/** Dot positions (0..8 in a 3x3 grid) for each pip count — for the views. */
export const PIP_SPOTS: number[][] = [
  [],
  [4],
  [0, 8],
  [0, 4, 8],
  [0, 2, 6, 8],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 6, 8],
];
