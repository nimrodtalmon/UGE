/** Tile encoding and meld validation, shared by server rules and phone UI. */

export interface Tile {
  n: number; // 1..13; 0 for jokers
  c: number; // 0..3; -1 for jokers
  joker: boolean;
}

export const TILE_COUNT = 106;

export function decode(id: number): Tile {
  if (id >= 104) return { n: 0, c: -1, joker: true };
  const base = id % 52;
  return { n: (base % 13) + 1, c: Math.floor(base / 13), joker: false };
}

export function buildPool(): number[] {
  return Array.from({ length: TILE_COUNT }, (_, i) => i);
}

/** A valid group (same number, distinct colors) or run (same color, consecutive). */
export function isValidMeld(ids: number[]): boolean {
  if (ids.length < 3 || new Set(ids).size !== ids.length) return false;
  const tiles = ids.map(decode);
  const jokers = tiles.filter((t) => t.joker).length;
  const rest = tiles.filter((t) => !t.joker);
  if (rest.length === 0) return false;

  // group: one number, all different colors, 3-4 tiles
  if (rest.every((t) => t.n === rest[0]!.n)) {
    const colors = new Set(rest.map((t) => t.c));
    if (colors.size === rest.length && ids.length <= 4) return true;
  }
  // run: one color, consecutive numbers (jokers fill gaps or extend the ends)
  if (new Set(rest.map((t) => t.c)).size === 1) {
    const ns = rest.map((t) => t.n).sort((a, b) => a - b);
    if (new Set(ns).size !== ns.length) return false;
    const span = ns[ns.length - 1]! - ns[0]! + 1;
    return ids.length <= 13 && rest.length + jokers >= span;
  }
  return false;
}

/** Point value of a meld for the 30-point opening (jokers count generously). */
export function meldValue(ids: number[]): number {
  const tiles = ids.map(decode);
  const jokers = tiles.filter((t) => t.joker).length;
  const rest = tiles.filter((t) => !t.joker);
  if (rest.length === 0) return 0;
  if (rest.every((t) => t.n === rest[0]!.n)) {
    return rest[0]!.n * ids.length; // group: jokers stand for the group number
  }
  // run: choose the highest window that still covers the real tiles
  const ns = rest.map((t) => t.n).sort((a, b) => a - b);
  const len = ids.length;
  const start = Math.min(ns[0]!, 13 - len + 1);
  void jokers;
  return len * start + (len * (len - 1)) / 2;
}

export const rackValue = (ids: number[]): number =>
  ids.reduce((sum, id) => {
    const t = decode(id);
    return sum + (t.joker ? 30 : t.n);
  }, 0);

export const canAppend = (meld: number[], tileId: number): boolean =>
  isValidMeld([...meld, tileId]);

/** Reading order for showing a meld: runs ascend (jokers dropped into the gaps
 *  they fill), groups sort by color. Validation never depends on order. */
export function displayOrder(ids: number[]): number[] {
  const jokers = ids.filter((id) => decode(id).joker);
  const rest = ids.filter((id) => !decode(id).joker);
  if (rest.length === 0) return [...ids];
  const runShaped =
    rest.length >= 2 &&
    new Set(rest.map((id) => decode(id).c)).size === 1 &&
    new Set(rest.map((id) => decode(id).n)).size === rest.length;
  if (runShaped) {
    const sorted = [...rest].sort((a, b) => decode(a).n - decode(b).n);
    const out: number[] = [];
    const spare = [...jokers];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) {
        let gap = decode(sorted[i]!).n - decode(sorted[i - 1]!).n - 1;
        while (gap-- > 0 && spare.length > 0) out.push(spare.pop()!);
      }
      out.push(sorted[i]!);
    }
    return [...out, ...spare];
  }
  return [
    ...[...rest].sort((a, b) => decode(a).n - decode(b).n || decode(a).c - decode(b).c),
    ...jokers,
  ];
}

export const COLOR_NAMES = ['red', 'blue', 'yellow', 'black'];
export const COLOR_HEX = ['#c0392b', '#2a6fc0', '#d1a02a', '#2b2d33'];
