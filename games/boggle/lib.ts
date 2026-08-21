/**
 * Boggle's rules kernel: the dice, the grid geometry, the traceability check
 * and the length scoring. Deliberately free of the word list — the views
 * import from here for the tracing UI, and shipping 45,000 words into every
 * phone's view bundle would be silly. The dictionary lives in words.ts.
 */

/**
 * The real dice. A face written "Qu" is one TILE carrying two letters, which
 * is how Boggle has always worked — "quit" is a three-tile, four-letter word.
 * The 5×5 set's plain Q is treated as Qu for the same reason.
 */
const DICE_4 = [
  'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS',
  'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
  'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW',
  // HIMNQU: six faces, and the Q face is printed "Qu" — the U is its own face
  'EIOSST', 'ELRTTY', 'HIMNQuU', 'HLNNRZ',
];

const DICE_5 = [
  'AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM',
  'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJKQuXZ', 'CCENST',
  'CEIILT', 'CEILPT', 'CEIPST', 'DDHNOT', 'DHHLOR',
  'DHHNOT', 'DHLNOR', 'EIIITT', 'EMOTTT', 'ENSSSU',
  'FIPRSY', 'GORRVW', 'HIPRRY', 'NOOTUW', 'OOOTTU',
];

/** Split a die into its six faces, keeping "Qu" as one tile. */
const facesOf = (die: string): string[] =>
  (die.match(/Qu|[A-Z]/g) ?? []).map((f) => f.toUpperCase());

export const diceFor = (size: number): string[][] =>
  (size === 5 ? DICE_5 : DICE_4).map(facesOf);

/**
 * Roll the board: shuffle the dice, then turn each one up. Every draw comes
 * from the platform's seeded random, so the same room rolls the same grid.
 */
export function rollGrid(size: number, random: () => number): string[] {
  const dice = diceFor(size);
  for (let i = dice.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [dice[i], dice[j]] = [dice[j]!, dice[i]!];
  }
  return dice.map((faces) => faces[Math.min(faces.length - 1, Math.floor(random() * faces.length))]!);
}

export const isAdjacent = (size: number, a: number, b: number): boolean => {
  if (a === b) return false;
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const dc = Math.abs((a % size) - (b % size));
  return dr <= 1 && dc <= 1;
};

export function neighbours(size: number, cell: number): number[] {
  const out: number[] = [];
  const r = Math.floor(cell / size);
  const c = cell % size;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      out.push(nr * size + nc);
    }
  }
  return out;
}

/**
 * The check people get wrong. A word only counts if you can walk it across
 * the grid: each tile touching the previous one (including diagonally) and no
 * tile used twice in the same word. Backtracking search, because the same
 * letter usually sits in several places and only one route may work.
 *
 * Returns the route it found (tile indices), or null when there is none.
 */
export function tracePath(word: string, letters: string[], size: number): number[] | null {
  const w = word.toUpperCase();
  if (w.length === 0) return null;
  const used = letters.map(() => false);
  const path: number[] = [];

  const step = (pos: number): boolean => {
    if (pos >= w.length) return true;
    for (let cell = 0; cell < letters.length; cell++) {
      if (used[cell]) continue; // no tile twice
      const face = letters[cell]!;
      if (!w.startsWith(face, pos)) continue;
      const prev = path[path.length - 1];
      if (prev !== undefined && !isAdjacent(size, prev, cell)) continue; // must touch
      used[cell] = true;
      path.push(cell);
      if (step(pos + face.length)) return true;
      path.pop();
      used[cell] = false;
    }
    return false;
  };

  return step(0) ? [...path] : null;
}

export const isTraceable = (word: string, letters: string[], size: number): boolean =>
  tracePath(word, letters, size) !== null;

/** Standard Boggle length scoring, on LETTERS (so Qu counts as two). */
export function scoreWord(word: string): number {
  const n = word.length;
  if (n < 3) return 0;
  if (n <= 4) return 1;
  if (n === 5) return 2;
  if (n === 6) return 3;
  if (n === 7) return 5;
  return 11;
}

/** Clean a word off the wire; null for anything that is not plain letters. */
export function normalizeWord(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const word = raw.trim().toLowerCase();
  return /^[a-z]{1,25}$/.test(word) ? word : null;
}
