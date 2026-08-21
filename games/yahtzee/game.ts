import type { GameDef, MoveCtx } from '../../src/shared/plugin.js';
import { pickCategory, planHolds } from './bot.js';
import { CATEGORIES, emptyCard, grandTotal, scoreFor } from './scoring.js';
import type { Card, CategoryId } from './scoring.js';

export interface YahtzeeState {
  playerNames: string[];
  /** One shared phone passed around; seats are virtual. */
  pass: boolean;
  current: number;
  /** 5 values 1..6; 0 before the first roll of a turn (dice shown blank). */
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  cards: Card[];
  done: boolean;
}

export interface YahtzeeView extends YahtzeeState {
  myIndex: number;
}

// only the current player's phone acts (pass mode: whoever holds it);
// the table is display-only
function actorOk(state: YahtzeeState, ctx: MoveCtx): boolean {
  if (state.pass) return ctx.role === 'hand';
  return ctx.players.findIndex((p) => p.id === ctx.playerId) === state.current;
}

const game: GameDef<YahtzeeState, YahtzeeView> = {
  setup({ players, mode, group }) {
    const pass = mode.config['pass'] === true;
    const seats = pass ? Math.max(1, Math.min(8, group?.players ?? 1)) : players.length;
    return {
      playerNames: pass
        ? Array.from({ length: seats }, (_, i) => `Player ${i + 1}`)
        : players.map((p) => p.name),
      pass,
      current: 0,
      dice: [0, 0, 0, 0, 0],
      held: [false, false, false, false, false],
      rollsLeft: 3,
      cards: Array.from({ length: seats }, () => emptyCard()),
      done: false,
    };
  },

  moves: {
    /** Roll all un-held dice (the first roll of a turn rolls all five). */
    roll(state, ctx) {
      if (state.done || state.rollsLeft <= 0 || !actorOk(state, ctx)) return state;
      const dice = state.dice.map((v, i) =>
        state.held[i] && v > 0 ? v : 1 + Math.floor(ctx.random() * 6),
      );
      return { ...state, dice, rollsLeft: state.rollsLeft - 1 };
    },

    /** Toggle hold on die i — only between the first roll and scoring. */
    hold(state, ctx, i: number) {
      if (state.done || !actorOk(state, ctx)) return state;
      if (!Number.isInteger(i) || i < 0 || i > 4) return state;
      if (state.rollsLeft >= 3) return state; // nothing rolled yet
      return { ...state, held: state.held.map((h, j) => (j === i ? !h : h)) };
    },

    /** Write the current dice into an open category and pass the turn. */
    score(state, ctx, category: CategoryId) {
      if (state.done || !actorOk(state, ctx)) return state;
      if (state.rollsLeft >= 3) return state; // must roll at least once
      if (!CATEGORIES.some((c) => c.id === category)) return state;
      if (state.cards[state.current]![category] !== null) return state;
      const cards = state.cards.map((c, i) =>
        i === state.current ? { ...c, [category]: scoreFor(category, state.dice) } : c,
      );
      return {
        ...state,
        cards,
        done: cards.every((c) => CATEGORIES.every((cat) => c[cat.id] !== null)),
        current: (state.current + 1) % state.playerNames.length,
        dice: [0, 0, 0, 0, 0],
        held: [false, false, false, false, false],
        rollsLeft: 3,
      };
    },
  },

  // dice and scorecards are public — nothing to hide, just tag the seat
  playerView(state, { playerId, players }) {
    return { ...state, myIndex: players.findIndex((p) => p.id === playerId) };
  },

  isOver(state) {
    if (!state.done) return null;
    const totals = state.cards.map(grandTotal);
    const top = Math.max(...totals);
    const winners = state.playerNames.filter((_, i) => totals[i] === top);
    return winners.length === 1
      ? { text: `${winners[0]} wins with ${top} points! 🏆` }
      : { text: `Tie — ${winners.join(' & ')} (${top} points)` };
  },

  /**
   * AI opponent — see bot.ts. Dice and scorecards are public, so there is
   * nothing here it should not look at; it just plays its own turn.
   *
   * One move per call: it toggles holds until they match the plan, then rolls
   * or scores. planHolds is stable for a given roll, so the holds converge and
   * the turn always ends in a score.
   */
  bot(state, { seat, level }) {
    if (state.done) return null;
    // pass-the-phone seats are virtual — the shared device plays them all
    if (state.pass) return null;
    if (seat !== state.current) return null;
    const card = state.cards[seat];
    if (!card) return null;
    if (state.rollsLeft >= 3) return { name: 'roll' };

    const want = planHolds(state.dice, card, level);
    for (let i = 0; i < want.length; i++) {
      if (want[i] !== state.held[i]) return { name: 'hold', args: [i] };
    }
    // nothing left to improve (or no rolls left): write it down
    if (state.rollsLeft > 0 && want.some((w) => !w)) return { name: 'roll' };
    return { name: 'score', args: [pickCategory(state.dice, card, level)] };
  },
};

export default game;
