import type { GameDef } from '../../src/shared/plugin.js';

const FACES = ['🐤', '🦊', '🐙', '🦄', '🍉', '🍕', '🚀', '🎈', '🌵', '🐳', '⚽', '🎲'];

export interface MemoryCard {
  face: string;
  state: 'down' | 'up' | 'matched';
  matchedBy: number | null;
}

export interface MemoryState {
  cards: MemoryCard[];
  playerNames: string[];
  current: number;
  scores: number[];
  mismatch: boolean;
  /** Server time of the mismatch — resolve is rejected until players had a look. */
  mismatchAt: number;
  /** One shared phone passed around; seats are virtual. */
  pass: boolean;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const game: GameDef<MemoryState> = {
  setup({ players, random, mode, group }) {
    const pass = mode.config['pass'] === true;
    const seats = pass ? Math.max(2, Math.min(6, group?.players ?? 2)) : players.length;
    const pairs = seats <= 3 ? 8 : 12;
    const faces = shuffle(FACES, random).slice(0, pairs);
    const cards = shuffle([...faces, ...faces], random).map((face) => ({
      face,
      state: 'down' as const,
      matchedBy: null,
    }));
    return {
      cards,
      playerNames: pass
        ? Array.from({ length: seats }, (_, i) => `Player ${i + 1}`)
        : players.map((p) => p.name),
      current: 0,
      scores: Array.from({ length: seats }, () => 0),
      mismatch: false,
      mismatchAt: 0,
      pass,
    };
  },

  moves: {
    flip(state, ctx, i: number) {
      if (state.mismatch || !Number.isInteger(i)) return state;
      const card = state.cards[i];
      if (!card || card.state !== 'down') return state;
      // only the current player's phone flips (pass mode: whoever holds it);
      // the table is display-only
      if (state.pass) {
        if (ctx.role !== 'hand') return state;
      } else if (ctx.players.findIndex((p) => p.id === ctx.playerId) !== state.current) {
        return state;
      }
      const firstIdx = state.cards.findIndex((c) => c.state === 'up');
      const cards = state.cards.map((c, j) => (j === i ? { ...c, state: 'up' as const } : c));
      if (firstIdx === -1) return { ...state, cards };
      if (cards[firstIdx]!.face === card.face) {
        const scores = [...state.scores];
        scores[state.current] = (scores[state.current] ?? 0) + 1;
        return {
          ...state,
          scores,
          cards: cards.map((c, j) =>
            j === i || j === firstIdx
              ? { ...c, state: 'matched' as const, matchedBy: state.current }
              : c,
          ),
        };
      }
      return { ...state, cards, mismatch: true, mismatchAt: ctx.now };
    },

    /** Flip a mismatched pair back and pass the turn. Sent by clients on a timer. */
    resolve(state, ctx) {
      // reject early (or stale, from a previous mismatch) resolves — everyone
      // gets at least a second to memorise the two faces
      if (!state.mismatch || ctx.now < state.mismatchAt + 1200) return state;
      return {
        ...state,
        mismatch: false,
        current: (state.current + 1) % state.playerNames.length,
        cards: state.cards.map((c) => (c.state === 'down' ? c : c.state === 'up' ? { ...c, state: 'down' as const } : c)),
      };
    },
  },

  playerView(state) {
    // face-down cards keep their secret out of the browser entirely
    return {
      ...state,
      cards: state.cards.map((c) => (c.state === 'down' ? { ...c, face: '' } : c)),
    };
  },

  isOver(state) {
    if (!state.cards.every((c) => c.state === 'matched')) return null;
    const top = Math.max(...state.scores);
    const winners = state.playerNames.filter((_, i) => state.scores[i] === top);
    return winners.length === 1
      ? { text: `${winners[0]} wins with ${top} pairs! 🏆` }
      : { text: `It's a tie — ${winners.join(' & ')} (${top} pairs)` };
  },
};

export default game;
