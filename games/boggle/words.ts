/**
 * The dictionary and the board solver. Kept out of lib.ts so the views can
 * import the grid helpers without dragging 45,000 words into a phone.
 *
 * The word list is a pluggable asset (assets/words.en.json) — swap the file
 * for another language and nothing here changes.
 */

import wordsJson from './assets/words.en.json' with { type: 'json' };
import { neighbours, scoreWord } from './lib.js';

const SHAPE = /^[a-z]{3,12}$/;

/** Filtered on load, so a stray entry in the asset can never break a round. */
export const WORDS: string[] = (wordsJson as string[]).filter((w) => SHAPE.test(w));

const DICT = new Set(WORDS);

export const isWord = (word: string): boolean => DICT.has(word);

interface Node {
  kids: Map<string, Node>;
  end: boolean;
}

let ROOT: Node | null = null;

/** Built once, on the first solve — a fresh room pays for it, not the import. */
function trie(): Node {
  if (ROOT) return ROOT;
  const root: Node = { kids: new Map(), end: false };
  for (const word of WORDS) {
    let node = root;
    for (const ch of word) {
      let next = node.kids.get(ch);
      if (!next) {
        next = { kids: new Map(), end: false };
        node.kids.set(ch, next);
      }
      node = next;
    }
    node.end = true;
  }
  ROOT = root;
  return root;
}

export interface Solution {
  /** Every word on this board, longest first. */
  words: string[];
  /** What a perfect player would score. */
  points: number;
}

/**
 * Every word the grid contains. Depth-first from each tile, walking the trie
 * in step with the path so a dead prefix is abandoned immediately — that is
 * what keeps an exhaustive search of a 5×5 board down to milliseconds.
 */
export function solve(letters: string[], size: number, minLen: number): Solution {
  const root = trie();
  const found = new Set<string>();
  const used = letters.map(() => false);

  const walk = (cell: number, node: Node, prefix: string): void => {
    const face = letters[cell]!.toLowerCase();
    let here = node;
    for (const ch of face) {
      const next = here.kids.get(ch);
      if (!next) return; // no word starts like this — stop walking
      here = next;
    }
    const word = prefix + face;
    if (here.end && word.length >= minLen) found.add(word);
    if (here.kids.size === 0) return;
    used[cell] = true;
    for (const nb of neighbours(size, cell)) if (!used[nb]) walk(nb, here, word);
    used[cell] = false;
  };

  for (let cell = 0; cell < letters.length; cell++) walk(cell, root, '');

  const words = [...found].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  return { words, points: words.reduce((sum, w) => sum + scoreWord(w), 0) };
}
