import type { GameDef } from '../../src/shared/plugin.js';
import { aim, layNext } from './bot.js';

/**
 * Classic Battleship, two phones + table. House-rule simplifications:
 * ships may touch (no one-cell gap rule), and a hit does NOT grant an
 * extra shot — turns alternate after every shot.
 *
 * Both fleets start in the tray: the place phase opens on an EMPTY sea and
 * every hull is put down by its owner (drag it, or tap the ship and then the
 * square its bow goes on), one `placeShip` at a time, validated here.
 * `autoPlace` fills whatever is still in the tray for a player who cannot be
 * bothered, and `ready` is refused until all five hulls are on the water.
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
  /** Bow cell: leftmost when horizontal, topmost when vertical. Only meaningful once `placed`. */
  x: number;
  y: number;
  horizontal: boolean;
  /** Board cells as y * SIZE + x — derived from x/y/horizontal/size. Empty while in the tray. */
  cells: number[];
  /** False while the hull is still in the tray, waiting to be put on the water. */
  placed: boolean;
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
  /** Hull positions of YOUR OWN fleet — for the placement UI. Null for the table. */
  myFleet: Ship[] | null;
  /** How many hulls each seat has put down — a count, never a position. */
  placedCount: [number, number];
  lastShot: BsState['lastShot'];
}

const idx = (x: number, y: number): number => y * SIZE + x;

/**
 * The cells a ship of `size` covers with its bow at (x, y), or null when it
 * would run off the board. Shared by the server and the placement views, so
 * both judge a drop the same way.
 */
export function shipCells(x: number, y: number, size: number, horizontal: boolean): number[] | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(size)) return null;
  if (size < 1 || x < 0 || y < 0) return null;
  const width = horizontal ? size : 1;
  const height = horizontal ? 1 : size;
  if (x + width > SIZE || y + height > SIZE) return null;
  return Array.from({ length: size }, (_, i) => (horizontal ? idx(x + i, y) : idx(x, y + i)));
}

/**
 * Where ship #i in `fleet` would land — null when it runs off the board or
 * overlaps another hull. Ships are allowed to touch (house rule). Hulls still
 * in the tray hold no cells, so they never block anything.
 */
export function canPlace(
  fleet: Ship[],
  shipIndex: number,
  x: number,
  y: number,
  horizontal: boolean,
): number[] | null {
  const ship = fleet[shipIndex];
  if (!ship) return null;
  const cells = shipCells(x, y, ship.size, horizontal);
  if (!cells) return null;
  const taken = new Set(fleet.flatMap((s, i) => (i === shipIndex ? [] : s.cells)));
  return cells.some((c) => taken.has(c)) ? null : cells;
}

/** The whole fleet, still in the tray. */
const emptyFleet = (): Ship[] =>
  FLEET.map(({ name, size }) => ({ name, size, x: 0, y: 0, horizontal: true, cells: [], placed: false }));

/** True once every hull is on the water — the gate on `ready`. */
export const allPlaced = (fleet: Ship[]): boolean => fleet.every((s) => s.placed);

/** The fleet with hull #i berthed at (x, y) — null when that berth is illegal. */
function withShip(fleet: Ship[], i: number, x: number, y: number, horizontal: boolean): Ship[] | null {
  const cells = canPlace(fleet, i, x, y, horizontal);
  if (!cells) return null;
  const next = [...fleet];
  next[i] = { ...fleet[i]!, x, y, horizontal, cells, placed: true };
  return next;
}

const isSunk = (ship: Ship, shots: ShotMark[]): boolean =>
  ship.cells.length > 0 && ship.cells.every((c) => shots[c] === 'hit');

const fleetSunk = (fleet: Ship[], shots: ShotMark[]): boolean =>
  fleet.every((s) => isSunk(s, shots));

const emptyShots = (): ShotMark[] => Array.from({ length: SIZE * SIZE }, () => '' as ShotMark);

/** The seat (0/1) of the device sending a move, or -1 (table, spectators). */
const seatOf = (ctx: { playerId: string; players: { id: string }[] }): number =>
  ctx.players.findIndex((p) => p.id === ctx.playerId);

const game: GameDef<BsState, BsView> = {
  setup({ players }) {
    return {
      phase: 'place',
      current: 0,
      names: [players[0]?.name ?? 'Player 1', players[1]?.name ?? 'Player 2'],
      ready: [false, false],
      fleets: [emptyFleet(), emptyFleet()],
      shots: [emptyShots(), emptyShots()],
      lastShot: null,
    };
  },

  moves: {
    /**
     * Put one of your own hulls on the water: bow at (x, y), lying
     * horizontally or not. Works both for a hull coming out of the tray and
     * for one already on the board. Only during the place phase, only for
     * your own fleet, and never once you have declared ready. Illegal drops
     * return the state unchanged.
     */
    placeShip(state, ctx, shipIndex: number, x: number, y: number, horizontal: boolean) {
      const seat = seatOf(ctx);
      if (state.phase !== 'place' || (seat !== 0 && seat !== 1) || state.ready[seat]) return state;
      const fleet = state.fleets[seat]!;
      if (!Number.isInteger(shipIndex) || shipIndex < 0 || shipIndex >= fleet.length) return state;
      if (!Number.isInteger(x) || !Number.isInteger(y)) return state;
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return state;
      if (horizontal !== true && horizontal !== false) return state;
      const next = withShip(fleet, shipIndex, x, y, horizontal);
      if (!next) return state;
      const fleets: [Ship[], Ship[]] = [...state.fleets];
      fleets[seat] = next;
      return { ...state, fleets };
    },

    /** "Fill the rest for me" — berths whatever is still in the tray at random. */
    autoPlace(state, ctx) {
      const seat = seatOf(ctx);
      if (state.phase !== 'place' || (seat !== 0 && seat !== 1) || state.ready[seat]) return state;
      let fleet = state.fleets[seat]!;
      if (allPlaced(fleet)) return state;
      for (let i = 0; i < FLEET.length; i++) {
        const spot = layNext(fleet, ctx.random);
        if (!spot) break;
        const next = withShip(fleet, spot.shipIndex, spot.x, spot.y, spot.horizontal);
        if (!next) break;
        fleet = next;
      }
      const fleets: [Ship[], Ship[]] = [...state.fleets];
      fleets[seat] = fleet;
      return { ...state, fleets };
    },

    /** Refused until your whole fleet is down. Both ready → play. */
    ready(state, ctx) {
      const seat = seatOf(ctx);
      if (state.phase !== 'place' || (seat !== 0 && seat !== 1) || state.ready[seat]) return state;
      if (!allPlaced(state.fleets[seat]!)) return state;
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
    // hull positions: your own fleet only — never the opponent's, never the table's
    const myFleet =
      myIndex === 0 || myIndex === 1
        ? state.fleets[myIndex]!.map((s) => ({ ...s, cells: [...s.cells] }))
        : null;
    return {
      phase: state.phase,
      current: state.current,
      myIndex,
      names: state.names,
      ready: state.ready,
      boards: [boardFor(0), boardFor(1)],
      myFleet,
      placedCount: [
        state.fleets[0].filter((s) => s.placed).length,
        state.fleets[1].filter((s) => s.placed).length,
      ],
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

  /**
   * AI opponent — see bot.ts. It lays out its own fleet first, one hull per
   * beat (so you can watch it fill up), and readies only when the last one is
   * down. Then it fires on its own shot marks alone: the opponent's fleet sits
   * in the same state object and is never read here.
   */
  bot(state, { seat, level, random }) {
    if (seat !== 0 && seat !== 1) return null;
    if (state.phase === 'place') {
      if (state.ready[seat]) return null;
      const fleet = state.fleets[seat]!;
      const spot = layNext(fleet, random);
      if (spot) return { name: 'placeShip', args: [spot.shipIndex, spot.x, spot.y, spot.horizontal] };
      // no berth left to fill: ready if the fleet is complete, otherwise sit
      // still (unreachable — 17 cells of hull always fit on a 10x10 sea)
      return allPlaced(fleet) ? { name: 'ready' } : null;
    }
    if (state.current !== seat) return null;
    const shot = aim(state.shots[seat === 0 ? 1 : 0], level, random);
    return shot ? { name: 'fire', args: [shot.x, shot.y] } : null;
  },
};

export default game;
