import type { GameDef } from '../../src/shared/plugin.js';
import {
  buildDeck,
  canFound,
  canMoveRun,
  canStack,
  isRun,
  parseSource,
  PILES,
  shuffle,
  suitOf,
  topOf,
} from './lib.js';

/** One tableau pile: `down` is face-down (bottom first), `up` is face-up (top last). */
export interface SolPile {
  down: number[];
  up: number[];
}

export interface SolState {
  tableau: SolPile[];
  /** Face-down; the card that gets drawn is the last element. */
  stock: number[];
  /** Face-up; the playable card is the last element. */
  waste: number[];
  /** By suit, ascending from the ace. */
  foundations: number[][];
  moves: number;
}

/** A pile as the phone sees it: face-down cards are a COUNT, never identities. */
export interface SolPileView {
  down: number;
  up: number[];
}

export interface SolView {
  tableau: SolPileView[];
  stockCount: number;
  wasteTop: number | null;
  wasteCount: number;
  foundations: number[][];
  moves: number;
  /** No legal move left anywhere — offer a fresh deal. */
  stuck: boolean;
  canAutoFinish: boolean;
}

const clone = (s: SolState): SolState => ({
  ...s,
  tableau: s.tableau.map((p) => ({ down: [...p.down], up: [...p.up] })),
  stock: [...s.stock],
  waste: [...s.waste],
  foundations: s.foundations.map((f) => [...f]),
});

function deal(random: () => number): SolState {
  const deck = shuffle(buildDeck(), random);
  const tableau: SolPile[] = [];
  for (let i = 0; i < PILES; i++) {
    const cards = deck.splice(0, i + 1);
    tableau.push({ down: cards.slice(0, i), up: cards.slice(i) });
  }
  return { tableau, stock: deck, waste: [], foundations: [[], [], [], []], moves: 0 };
}

/** After a card leaves a tableau pile, the newly exposed card turns face up. */
function flip(pile: SolPile): void {
  if (pile.up.length === 0 && pile.down.length > 0) pile.up.push(pile.down.pop()!);
}

const won = (s: SolState): boolean => s.foundations.every((f) => f.length === 13);

/**
 * Is any legal move left? Cards buried in the stock count as reachable — with
 * unlimited passes the player can always cycle them up to the waste, so this
 * leaks nothing they could not learn by drawing. Foundation → tableau moves are
 * ignored here: they can technically unstick a deal, but never in practice.
 */
function anyMove(s: SolState): boolean {
  const foundTops = s.foundations.map(topOf);
  const destTops = s.tableau.map((p) => topOf(p.up));
  const playable = (card: number): boolean =>
    canFound(card, foundTops[suitOf(card)]!) || destTops.some((t) => canStack(card, t));

  for (const card of s.stock) if (playable(card)) return true;
  for (const card of s.waste) if (playable(card)) return true;

  for (let i = 0; i < s.tableau.length; i++) {
    const p = s.tableau[i]!;
    const top = topOf(p.up);
    if (top === null) continue;
    if (canFound(top, foundTops[suitOf(top)]!)) return true;
    for (let k = 0; k < p.up.length; k++) {
      const wholePile = k === 0 && p.down.length === 0;
      for (let j = 0; j < s.tableau.length; j++) {
        if (j !== i && canMoveRun(p.up[k]!, wholePile, destTops[j]!)) return true;
      }
    }
  }
  return false;
}

/**
 * Auto-finish is offered once nothing is face-down in the tableau: every pile is
 * then a descending run and every stock card is reachable, so sending the whole
 * deck home in rank order always succeeds.
 */
const canAutoFinish = (s: SolState): boolean =>
  !won(s) && s.tableau.every((p) => p.down.length === 0);

const game: GameDef<SolState, SolView> = {
  setup({ random }) {
    return deal(random);
  },

  moves: {
    /**
     * Turn one card from the stock onto the waste. With the stock empty the
     * whole waste turns back over to become the new stock (unlimited passes —
     * the friendly variant; a redeal costs one move like any other).
     */
    drawStock(state, ctx) {
      if (ctx.role === 'table') return state; // the table is display-only
      if (state.stock.length === 0 && state.waste.length === 0) return state;
      const s = clone(state);
      if (s.stock.length > 0) {
        s.waste.push(s.stock.pop()!);
      } else {
        s.stock = [...s.waste].reverse();
        s.waste = [];
      }
      s.moves++;
      return s;
    },

    /** Send the top card of the waste or of a tableau pile to its foundation. */
    moveToFoundation(state, ctx, from: string) {
      if (ctx.role === 'table') return state;
      const src = parseSource(from);
      if (!src) return state;
      const card = topOf(src.kind === 'waste' ? state.waste : state.tableau[src.pile]!.up);
      if (card === null) return state;
      const suit = suitOf(card);
      if (!canFound(card, topOf(state.foundations[suit]!))) return state;

      const s = clone(state);
      if (src.kind === 'waste') {
        s.waste.pop();
      } else {
        const p = s.tableau[src.pile]!;
        p.up.pop();
        flip(p);
      }
      s.foundations[suit]!.push(card);
      s.moves++;
      return s;
    },

    /**
     * Move the waste's top card, or a face-up run starting at `fromIndex` within
     * a tableau pile, onto another tableau pile.
     */
    moveToTableau(state, ctx, from: string, fromIndex: number, toPile: number) {
      if (ctx.role === 'table') return state;
      const src = parseSource(from);
      if (!src || !Number.isInteger(fromIndex) || !Number.isInteger(toPile)) return state;
      if (toPile < 0 || toPile >= PILES) return state;
      const destTop = topOf(state.tableau[toPile]!.up);

      if (src.kind === 'waste') {
        const card = topOf(state.waste);
        if (fromIndex !== 0 || card === null) return state;
        if (!canMoveRun(card, false, destTop)) return state;
        const s = clone(state);
        s.waste.pop();
        s.tableau[toPile]!.up.push(card);
        s.moves++;
        return s;
      }

      if (src.pile === toPile) return state;
      const source = state.tableau[src.pile]!;
      if (fromIndex < 0 || fromIndex >= source.up.length) return state;
      const run = source.up.slice(fromIndex);
      // runs are descending-alternating by construction; check anyway
      if (!isRun(run)) return state;
      const wholePile = fromIndex === 0 && source.down.length === 0;
      if (!canMoveRun(run[0]!, wholePile, destTop)) return state;

      const s = clone(state);
      const p = s.tableau[src.pile]!;
      p.up.splice(fromIndex);
      flip(p);
      s.tableau[toPile]!.up.push(...run);
      s.moves++;
      return s;
    },

    /** Pull a foundation's top card back onto the tableau — legal Klondike. */
    moveFoundationToTableau(state, ctx, suit: number, toPile: number) {
      if (ctx.role === 'table') return state;
      if (!Number.isInteger(suit) || suit < 0 || suit >= 4) return state;
      if (!Number.isInteger(toPile) || toPile < 0 || toPile >= PILES) return state;
      const card = topOf(state.foundations[suit]!);
      if (card === null) return state;
      if (!canStack(card, topOf(state.tableau[toPile]!.up))) return state;

      const s = clone(state);
      s.foundations[suit]!.pop();
      s.tableau[toPile]!.up.push(card);
      s.moves++;
      return s;
    },

    /** Nothing left face-down: send the whole deck home in one tap. */
    autoFinish(state, ctx) {
      if (ctx.role === 'table') return state;
      if (!canAutoFinish(state)) return state;
      const s = clone(state);
      let progress = true;
      while (progress) {
        progress = false;
        const home = (card: number): void => {
          s.foundations[suitOf(card)]!.push(card);
          s.moves++;
          progress = true;
        };
        for (const p of s.tableau) {
          const card = topOf(p.up);
          if (card !== null && canFound(card, topOf(s.foundations[suitOf(card)]!))) {
            p.up.pop();
            home(card);
          }
        }
        // every stock card is reachable by cycling, so treat both as one bag
        for (const bag of [s.waste, s.stock]) {
          for (let i = bag.length - 1; i >= 0; i--) {
            const card = bag[i]!;
            if (canFound(card, topOf(s.foundations[suitOf(card)]!))) {
              bag.splice(i, 1);
              home(card);
            }
          }
        }
      }
      // the precondition guarantees a clean sweep; a partial one is a bug, not a move
      return won(s) ? s : state;
    },

    /** Give up on a dead deal and shuffle a new one. */
    restart(state, ctx) {
      if (ctx.role === 'table') return state;
      return deal(ctx.random);
    },
  },

  /**
   * One player, so nothing is secret between devices — but the deck order is.
   * Face-down cards (the stock and the buried tableau cards) go out as counts
   * only, so the deal cannot be read out of the browser's devtools.
   */
  playerView(state) {
    return {
      tableau: state.tableau.map((p) => ({ down: p.down.length, up: [...p.up] })),
      stockCount: state.stock.length,
      wasteTop: topOf(state.waste),
      wasteCount: state.waste.length,
      foundations: state.foundations.map((f) => [...f]),
      moves: state.moves,
      stuck: !won(state) && !anyMove(state),
      canAutoFinish: canAutoFinish(state),
    };
  },

  isOver(state) {
    return won(state) ? { text: `🃏 Solitaire! Out in ${state.moves} moves.` } : null;
  },
};

export default game;
