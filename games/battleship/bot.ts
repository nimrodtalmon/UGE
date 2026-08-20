import { SIZE } from './game.js';

/**
 * A Battleship gunner that only ever looks at its own shot results — the marks
 * on the opponent's sea (`state.shots[opponent]`: '', 'hit' or 'miss'). The
 * opponent's fleet layout is in the state and is deliberately never read here,
 * so the bot hunts and targets exactly as a person with a pencil would.
 */

type Mark = '' | 'hit' | 'miss';

export interface Shot {
  x: number;
  y: number;
}

const xy = (cell: number): Shot => ({ x: cell % SIZE, y: Math.floor(cell / SIZE) });
const cellAt = (x: number, y: number): number => y * SIZE + x;
const inside = (x: number, y: number): boolean => x >= 0 && x < SIZE && y >= 0 && y < SIZE;

const DIRS: Shot[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const pickOne = (cells: number[], random: () => number): number =>
  cells[Math.min(cells.length - 1, Math.floor(random() * cells.length))]!;

const open = (shots: Mark[], x: number, y: number): boolean =>
  inside(x, y) && shots[cellAt(x, y)] === '';

/** Un-shot cells next to a cell we have hit — the classic "finish it off" ring. */
function ring(shots: Mark[]): number[] {
  const out: number[] = [];
  shots.forEach((mark, cell) => {
    if (mark !== 'hit') return;
    const { x, y } = xy(cell);
    for (const d of DIRS) if (open(shots, x + d.x, y + d.y)) out.push(cellAt(x + d.x, y + d.y));
  });
  return [...new Set(out)];
}

/**
 * Two hits in a line mean a ship lying that way: the next shot goes at either
 * end of the line, never off to the side.
 */
function alongLines(shots: Mark[]): number[] {
  const out: number[] = [];
  shots.forEach((mark, cell) => {
    if (mark !== 'hit') return;
    const { x, y } = xy(cell);
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!inside(nx, ny) || shots[cellAt(nx, ny)] !== 'hit') continue;
      // walk to the far end of the run of hits and take the cell past it
      let ex = nx;
      let ey = ny;
      while (inside(ex + d.x, ey + d.y) && shots[cellAt(ex + d.x, ey + d.y)] === 'hit') {
        ex += d.x;
        ey += d.y;
      }
      if (open(shots, ex + d.x, ey + d.y)) out.push(cellAt(ex + d.x, ey + d.y));
    }
  });
  return [...new Set(out)];
}

const unshot = (shots: Mark[]): number[] => shots.flatMap((m, c) => (m === '' ? [c] : []));

/**
 * Where to fire next, given only the marks on the target board. Null when the
 * whole sea has been shot at.
 *
 * easy   — anywhere untouched.
 * normal — random until something is hit, then work around the hit.
 * sharp  — the same, plus a checkerboard search (no ship of 2+ can hide
 *          between the black squares) and it follows a hit line's direction.
 */
export function aim(shots: Mark[], level: string, random: () => number): Shot | null {
  const free = unshot(shots);
  if (free.length === 0) return null;
  if (level === 'easy') return xy(pickOne(free, random));

  if (level === 'sharp') {
    const line = alongLines(shots);
    if (line.length > 0) return xy(pickOne(line, random));
  }
  const near = ring(shots);
  if (near.length > 0) return xy(pickOne(near, random));

  if (level === 'sharp') {
    const parity = free.filter((c) => (c % SIZE + Math.floor(c / SIZE)) % 2 === 0);
    if (parity.length > 0) return xy(pickOne(parity, random));
  }
  return xy(pickOne(free, random));
}
