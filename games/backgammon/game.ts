import type { GameDef, MoveCtx } from '../../src/shared/plugin.js';

export type Seat = 0 | 1;

/** The physical position, shared by the rules and the views' legality hints. */
export interface BoardState {
  /** 24 points, signed: positive = seat-0 checkers, negative = seat-1.
   *  Seat 0 (white) moves 23→0 and bears off past 0; seat 1 the opposite. */
  points: number[];
  /** Checkers on the bar, per seat. */
  bar: [number, number];
  /** Checkers borne off, per seat. First to 15 wins. */
  borneOff: [number, number];
}

export interface BgState extends BoardState {
  turn: Seat;
  phase: 'roll' | 'move';
  /** Dice left to play this turn (a double appears four times). */
  dice: number[];
  /** The last rolled pair, kept for display. */
  rolled: [number, number] | null;
  /** One-line notice ("rolled 6-6 — no legal moves"). */
  note: string | null;
  names: [string, string];
  shared: boolean;
  overText: string | null;
}

/** Everything is public in backgammon — the view is the state plus my seat. */
export interface BgView extends BgState {
  myIndex: number;
}

/** One legal single-die play: move `from` (-1 = bar) by `die`, landing on `to`. */
export interface Step {
  from: number;
  die: number;
  to: number | 'off';
}

const sgn = (seat: Seat): number => (seat === 0 ? 1 : -1);
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
const at = (points: number[], p: number): number => points[p] ?? 0;
/** May `seat` land on point `p`? Open, own, or a lone opposing checker (a hit). */
const isOpen = (points: number[], seat: Seat, p: number): boolean =>
  at(points, p) * sgn(seat) >= -1;
/** Pip distance of point `p` from bearing off, 1..24, from `seat`'s side. */
const pip = (seat: Seat, p: number): number => (seat === 0 ? p + 1 : 24 - p);

function allHome(b: BoardState, seat: Seat): boolean {
  if (b.bar[seat] > 0) return false;
  for (let p = 0; p < 24; p++) {
    if (pip(seat, p) > 6 && at(b.points, p) * sgn(seat) > 0) return false;
  }
  return true;
}

/** Highest occupied pip for `seat` (0 when no checkers remain on the board). */
function maxPip(b: BoardState, seat: Seat): number {
  let m = 0;
  for (let p = 0; p < 24; p++) {
    if (at(b.points, p) * sgn(seat) > 0) m = Math.max(m, pip(seat, p));
  }
  return m;
}

/**
 * Where moving from `from` (-1 = bar) by `die` legally lands for `seat`:
 * a point index, 'off' (bear off), or null when illegal. Enforces: bar first,
 * blocked points, home-board-only bear-off, exact-or-highest bear-off die.
 */
export function legalStep(b: BoardState, seat: Seat, from: number, die: number): number | 'off' | null {
  if (b.bar[seat] > 0) {
    if (from !== -1) return null; // must enter from the bar first
    const entry = seat === 0 ? 24 - die : die - 1; // opponent's home board
    return isOpen(b.points, seat, entry) ? entry : null;
  }
  if (from < 0 || from > 23 || at(b.points, from) * sgn(seat) <= 0) return null;
  const to = seat === 0 ? from - die : from + die;
  if (to >= 0 && to <= 23) return isOpen(b.points, seat, to) ? to : null;
  // Past the edge: bearing off.
  if (!allHome(b, seat)) return null;
  const d = pip(seat, from);
  if (die === d) return 'off';
  // Die larger than the point: only allowed from the highest occupied point.
  return d === maxPip(b, seat) ? 'off' : null;
}

/** Every legal single-die step for `seat` given the remaining dice. */
export function legalSingleSteps(b: BoardState, seat: Seat, dice: number[]): Step[] {
  const out: Step[] = [];
  const seen = new Set<number>();
  for (const die of dice) {
    if (seen.has(die)) continue;
    seen.add(die);
    const froms = b.bar[seat] > 0 ? [-1] : Array.from({ length: 24 }, (_, p) => p);
    for (const from of froms) {
      const to = legalStep(b, seat, from, die);
      if (to !== null) out.push({ from, die, to });
    }
  }
  return out;
}

/** Standard start: 2 on the 24-point, 5 on the 13, 3 on the 8, 5 on the 6. */
function startPoints(): number[] {
  const points = new Array<number>(24).fill(0);
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return points;
}

const board = (s: BgState): BoardState => ({ points: s.points, bar: s.bar, borneOff: s.borneOff });

/** In shared mode the one phone acts for whichever seat is to move. */
const isActor = (state: BgState, ctx: MoveCtx): boolean =>
  state.shared ? ctx.role === 'hand' : ctx.players[state.turn]?.id === ctx.playerId;

const game: GameDef<BgState, BgView> = {
  setup({ players, mode }) {
    const shared = mode.config['shared'] === true;
    return {
      points: startPoints(),
      bar: [0, 0],
      borneOff: [0, 0],
      turn: 0,
      phase: 'roll',
      dice: [],
      rolled: null,
      note: null,
      names: shared
        ? ['White', 'Black']
        : [players[0]?.name ?? 'White', players[1]?.name ?? 'Black'],
      shared,
      overText: null,
    };
  },

  moves: {
    roll(state, ctx) {
      if (state.overText || state.phase !== 'roll' || !isActor(state, ctx)) return state;
      const d1 = 1 + Math.floor(ctx.random() * 6);
      const d2 = 1 + Math.floor(ctx.random() * 6);
      const rolled: [number, number] = [d1, d2];
      const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      if (legalSingleSteps(board(state), state.turn, dice).length === 0) {
        return {
          ...state,
          rolled,
          dice: [],
          turn: other(state.turn),
          note: `${state.names[state.turn]} rolled ${d1}-${d2} — no legal moves`,
        };
      }
      return { ...state, rolled, dice, phase: 'move', note: null };
    },

    /** Play one die: move a checker from `from` (-1 = enter from the bar). */
    step(state, ctx, from: number, die: number) {
      if (state.overText || state.phase !== 'move' || !isActor(state, ctx)) return state;
      if (!Number.isInteger(from) || !Number.isInteger(die)) return state;
      if (die < 1 || die > 6 || !state.dice.includes(die)) return state;
      if (from !== -1 && (from < 0 || from > 23)) return state;
      const seat = state.turn;
      const to = legalStep(board(state), seat, from, die);
      if (to === null) return state;

      const s = sgn(seat);
      const points = [...state.points];
      const bar: [number, number] = [state.bar[0], state.bar[1]];
      const borneOff: [number, number] = [state.borneOff[0], state.borneOff[1]];
      if (from === -1) bar[seat] -= 1;
      else points[from] = at(points, from) - s;
      if (to === 'off') {
        borneOff[seat] += 1;
      } else {
        if (at(points, to) === -s) {
          points[to] = 0; // hit the lone blot to the bar
          bar[other(seat)] += 1;
        }
        points[to] = at(points, to) + s;
      }

      if (borneOff[seat] === 15) {
        return {
          ...state,
          points,
          bar,
          borneOff,
          dice: [],
          note: null,
          overText: `🧿 ${state.names[seat]} bears off all 15 — Shesh-Besh!`,
        };
      }

      const dice = [...state.dice];
      dice.splice(dice.indexOf(die), 1);
      if (dice.length > 0 && legalSingleSteps({ points, bar, borneOff }, seat, dice).length > 0) {
        return { ...state, points, bar, borneOff, dice, note: null };
      }
      // Out of dice, or nothing left is playable — the turn passes.
      return {
        ...state,
        points,
        bar,
        borneOff,
        dice: [],
        turn: other(seat),
        phase: 'roll',
        note: dice.length > 0 ? `${state.names[seat]} had no play for ${dice.join(', ')}` : null,
      };
    },
  },

  playerView(state, { playerId, players }) {
    return { ...state, myIndex: players.findIndex((p) => p.id === playerId) };
  },

  isOver(state) {
    return state.overText ? { text: state.overText } : null;
  },
};

export default game;
