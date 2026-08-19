import type { GameDef } from '../../src/shared/plugin.js';
import wordsJson from './assets/words.en.json' with { type: 'json' };

const WORDS = wordsJson as string[];

export type Team = 'red' | 'blue';
export type CardKind = Team | 'neutral' | 'assassin';

export interface CodenamesState {
  words: string[];
  key: CardKind[];
  revealed: boolean[];
  turn: Team;
  first: Team;
  winner: Team | null;
  winText: string | null;
  /** One-shared-phone mode: the spymasters device also taps the guesses. */
  solo: boolean;
  /** Hand devices in seat order, and each one's team (alternating). null when
   *  a single shared guessing phone serves both teams. */
  playerIds: string[];
  guesserTeams: Team[] | null;
}

/** key entries are null until revealed — except for spymasters and finished games. */
export interface CodenamesView {
  words: string[];
  key: (CardKind | null)[];
  revealed: boolean[];
  turn: Team;
  first: Team;
  remaining: { red: number; blue: number };
  winner: Team | null;
  solo: boolean;
  /** This device's team — null for shared phones, spymasters, and the table. */
  myTeam: Team | null;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red');
const cap = (t: Team) => (t === 'red' ? 'Red' : 'Blue');

function mayGuess(state: CodenamesState, ctx: { playerId: string; role: string }): boolean {
  if (state.solo && ctx.role === 'spymasters') return true;
  if (ctx.role !== 'hand') return false;
  // with a phone per team, only the team whose turn it is may act
  if (state.guesserTeams) {
    const idx = state.playerIds.indexOf(ctx.playerId);
    if (idx >= 0 && state.guesserTeams[idx] !== state.turn) return false;
  }
  return true;
}

const game: GameDef<CodenamesState, CodenamesView> = {
  setup({ players, random, mode }) {
    const words = shuffle(WORDS, random).slice(0, 25);
    const first: Team = random() < 0.5 ? 'red' : 'blue';
    const key = shuffle<CardKind>(
      [
        ...Array<CardKind>(9).fill(first),
        ...Array<CardKind>(8).fill(other(first)),
        ...Array<CardKind>(7).fill('neutral'),
        'assassin',
      ],
      random,
    );
    const solo = mode.config['solo'] === true;
    const playerIds = players.map((p) => p.id);
    return {
      words,
      key,
      revealed: Array(25).fill(false),
      turn: first,
      first,
      winner: null,
      winText: null,
      solo,
      playerIds,
      // 2+ guessing phones: alternate them red/blue so each team acts only on
      // its own turn; a single shared phone stays usable by both teams
      guesserTeams:
        !solo && playerIds.length >= 2
          ? playerIds.map((_, i): Team => (i % 2 === 0 ? 'red' : 'blue'))
          : null,
    };
  },

  moves: {
    /** Operatives tap the word their spymaster clued (clues are spoken aloud). */
    guess(state, ctx, i: number) {
      if (state.winner || !mayGuess(state, ctx)) return state;
      if (!Number.isInteger(i) || i < 0 || i >= 25 || state.revealed[i]) return state;
      const revealed = state.revealed.map((r, j) => r || j === i);
      const kind = state.key[i]!;
      if (kind === 'assassin') {
        return {
          ...state,
          revealed,
          winner: other(state.turn),
          winText: `${cap(other(state.turn))} team wins — ${state.turn} found the assassin! 💀`,
        };
      }
      const remaining = (t: Team) => state.key.filter((k, j) => k === t && !revealed[j]).length;
      for (const t of ['red', 'blue'] as Team[]) {
        if (remaining(t) === 0) {
          return { ...state, revealed, winner: t, winText: `${cap(t)} team wins! 🎉` };
        }
      }
      // wrong-team or neutral guess ends the turn
      return { ...state, revealed, turn: kind === state.turn ? state.turn : other(state.turn) };
    },

    endTurn(state, ctx) {
      if (state.winner || !mayGuess(state, ctx)) return state;
      return { ...state, turn: other(state.turn) };
    },
  },

  playerView(state, { playerId, role }) {
    // one shared "spymasters" device holds the key card for both teams
    const showAll = state.winner !== null || role === 'spymasters';
    const idx = playerId !== null && role === 'hand' ? state.playerIds.indexOf(playerId) : -1;
    return {
      words: state.words,
      key: state.key.map((k, i) => (showAll || state.revealed[i] ? k : null)),
      revealed: state.revealed,
      turn: state.turn,
      first: state.first,
      remaining: {
        red: state.key.filter((k, i) => k === 'red' && !state.revealed[i]).length,
        blue: state.key.filter((k, i) => k === 'blue' && !state.revealed[i]).length,
      },
      winner: state.winner,
      solo: state.solo,
      myTeam: state.guesserTeams && idx >= 0 ? (state.guesserTeams[idx] ?? null) : null,
    };
  },

  isOver(state) {
    return state.winner ? { text: state.winText ?? `${cap(state.winner)} team wins!` } : null;
  },
};

export default game;
