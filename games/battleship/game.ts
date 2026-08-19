import type { GameDef } from '../../src/shared/plugin.js';

/**
 * Classic Battleship, two phones + table. House-rule simplifications:
 * ships may touch (no one-cell gap rule), and a hit does NOT grant an
 * extra shot — turns alternate after every shot.
 */

export const SIZE = 10;

const FLEET = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
] as const;

export interface Ship {
  name: string;
  size: number;
  /** Board cells as y * SIZE + x. */
  cells: number[];
}

type ShotMark = '' | 'hit' | 'miss';

export interface BsState {
  phase: 'place' | 'play';
  /** Seat whose turn it is to fire (play phase). */
  current: number;
  names: [string, string];
  ready: [boolean, boolean];
  fleets: [Ship[], Ship[]];
  /** shots[i][cell] — shots fired AT seat i's board. */
  shots: [ShotMark[], ShotMark[]];
  lastShot: { board: number; x: number; y: number; result: 'hit' | 'miss' | 'sunk' } | null;
}

/** What one cell looks like to a given device — 'ship' only ever on your OWN board. */
export type BsCell = 'water' | 'ship' | 'hit' | 'miss' | 'sunk';

export interface ShipStatus {
  name: string;
  size: number;
  sunk: boolean;
}

export interface BsBoard {
  cells: BsCell[];
  /** Fleet composition is public; positions are not. */
  ships: ShipStatus[];
}

export interface BsView {
  phase: 'place' | 'play';
  current: number;
  myIndex: number;
  names: [string, string];
  ready: [boolean, boolean];
  /** boards[i] = seat i's sea, filtered for this device. */
  boards: [BsBoard, BsBoard];
  lastShot: BsState['lastShot'];
}

const idx = (x: number, y: number): number => y * SIZE + x;

/** Random valid fleet: rejection-sample each ship, restart on a dead end. */
function placeFleet(random: () => number): Ship[] {
  for (;;) {
    const taken = new Set<number>();
    const ships: Ship[] = [];
    for (const { name, size } of FLEET) {
      let cells: number[] | null = null;
      for (let attempt = 0; attempt < 200 && !cells; attempt++) {
        const horizontal = random() < 0.5;
        const x0 = Math.floor(random() * (horizontal ? SIZE - size + 1 : SIZE));
        const y0 = Math.floor(random() * (horizontal ? SIZE : SIZE - size + 1));
        const tryCells = Array.from({ length: size }, (_, i) =>
          horizontal ? idx(x0 + i, y0) : idx(x0, y0 + i),
        );
        if (!tryCells.some((c) => taken.has(c))) cells = tryCells;
      }
      if (!cells) break; // dead end (touching is allowed, so nearly impossible)
      for (const c of cells) taken.add(c);
      ships.push({ name, size, cells });
    }
    if (ships.length === FLEET.length) return ships;
  }
}

const isSunk = (ship: Ship, shots: ShotMark[]): boolean =>
  ship.cells.every((c) => shots[c] === 'hit');

const fleetSunk = (fleet: Ship[], shots: ShotMark[]): boolean =>
  fleet.every((s) => isSunk(s, shots));

const emptyShots = (): ShotMark[] => Array.from({ length: SIZE * SIZE }, () => '' as ShotMark);

/** The seat (0/1) of the device sending a move, or -1 (table, spectators). */
const seatOf = (ctx: { playerId: string; players: { id: string }[] }): number =>
  ctx.players.findIndex((p) => p.id === ctx.playerId);

const game: GameDef<BsState, BsView> = {
  setup({ players, random }) {
    return {
      phase: 'place',
      current: 0,
      names: [players[0]?.name ?? 'Player 1', players[1]?.name ?? 'Player 2'],
      ready: [false, false],
      fleets: [placeFleet(random), placeFleet(random)],
      shots: [emptyShots(), emptyShots()],
      lastShot: null,
    };
  },

  moves: {
    /** Re-roll your own placement — only before you declared ready. */
    shuffle(state, ctx) {
      const seat = seatOf(ctx);
      if (state.phase !== 'place' || (seat !== 0 && seat !== 1) || state.ready[seat]) return state;
      const fleets: [Ship[], Ship[]] = [...state.fleets];
      fleets[seat] = placeFleet(ctx.random);
      return { ...state, fleets };
    },

    /** Idempotent: declaring ready twice changes nothing. Both ready → play. */
    ready(state, ctx) {
      const seat = seatOf(ctx);
      if (state.phase !== 'place' || (seat !== 0 && seat !== 1) || state.ready[seat]) return state;
      const ready: [boolean, boolean] = [...state.ready];
      ready[seat] = true;
      return ready[0] && ready[1]
        ? { ...state, ready, phase: 'play', current: 0 }
        : { ...state, ready };
    },

    fire(state, ctx, x: number, y: number) {
      if (state.phase !== 'play') return state;
      const seat = seatOf(ctx);
      if (seat !== state.current) return state;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= SIZE || y < 0 || y >= SIZE)
        return state;
      const target = seat === 0 ? 1 : 0;
      const cell = idx(x, y);
      if (state.shots[target]![cell] !== '') return state;
      const shots: [ShotMark[], ShotMark[]] = [...state.shots];
      const targetShots = [...shots[target]!];
      const hitShip = state.fleets[target]!.find((s) => s.cells.includes(cell));
      targetShots[cell] = hitShip ? 'hit' : 'miss';
      shots[target] = targetShots;
      const result = hitShip ? (isSunk(hitShip, targetShots) ? 'sunk' : 'hit') : 'miss';
      return {
        ...state,
        shots,
        current: target, // classic alternate turns: a hit does not grant an extra shot
        lastShot: { board: target, x, y, result },
      };
    },
  },

  playerView(state, { playerId, players }) {
    const myIndex = players.findIndex((p) => p.id === playerId);
    // Un-hit ship cells only ever reach their owner's device; the table and
    // the opponent get shots (hit/miss) plus fully sunk ships.
    const boardFor = (seat: number): BsBoard => {
      const own = seat === myIndex;
      const shots = state.shots[seat]!;
      const fleet = state.fleets[seat]!;
      const cells: BsCell[] = Array.from({ length: SIZE * SIZE }, () => 'water' as BsCell);
      if (own) for (const s of fleet) for (const c of s.cells) cells[c] = 'ship';
      shots.forEach((mark, c) => {
        if (mark !== '') cells[c] = mark;
      });
      for (const s of fleet)
        if (isSunk(s, shots)) for (const c of s.cells) cells[c] = 'sunk';
      return {
        cells,
        ships: fleet.map((s) => ({ name: s.name, size: s.size, sunk: isSunk(s, shots) })),
      };
    };
    return {
      phase: state.phase,
      current: state.current,
      myIndex,
      names: state.names,
      ready: state.ready,
      boards: [boardFor(0), boardFor(1)],
      lastShot: state.lastShot,
    };
  },

  isOver(state) {
    if (state.phase !== 'play') return null;
    for (const loser of [0, 1] as const) {
      if (fleetSunk(state.fleets[loser], state.shots[loser])) {
        return { text: `⚓ ${state.names[loser === 0 ? 1 : 0]} sinks the whole fleet! 🏆` };
      }
    }
    return null;
  },
};

export default game;
