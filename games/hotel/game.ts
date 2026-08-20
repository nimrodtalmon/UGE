import type { GameDef, GameResult, MoveCtx } from '../../src/shared/plugin.js';
import type {
  Costs,
  FacilityKind,
  Floor,
  HotelState,
  RoomKind,
  Season,
  SlotKind,
  WeekReport,
} from './sim.js';
import {
  AD_COST,
  FACILITY_UPKEEP,
  FLOOR_UPKEEP,
  MAX_FLOORS,
  MAX_STAFF,
  RECEPTION_MAX,
  REFUND,
  ROOMS_PER_STAFF,
  ROOM_KINDS,
  SPECS,
  STAFF_WAGE,
  clampRate,
  facilityList,
  fairRate,
  floorCost,
  freshState,
  isFacilityKind,
  isRoomKind,
  isSlotKind,
  money,
  priceFactor,
  receptionCost,
  roomCounts,
  seasonFor,
  simulateWeek,
  slotCount,
  staffNeeded,
  totalBeds,
  totalRooms,
  weeklyCosts,
} from './sim.js';

/**
 * Hotel Empire — a one-player builder played in weeks, not seconds.
 *
 * You stack floors, fill their slots with rooms and facilities, set nightly
 * rates, staff the place and then tap "next week" to settle it: demand shows
 * up, rooms fill, wages and upkeep come out of the till. Nothing ticks on its
 * own — the platform syncs by polling, so the player advances the clock.
 *
 * Two modes: Relaxed (a sandbox that never ends) and Tycoon (a cash goal
 * inside a week limit, losable by bankruptcy or by running out of weeks).
 */

export type { HotelState, WeekReport, Floor } from './sim.js';

export interface HotelView extends HotelState {
  // derived numbers, so views never re-implement the economy
  rooms: Record<RoomKind, number>;
  roomsBuilt: number;
  beds: number;
  facilities: FacilityKind[];
  /** Fair nightly price per room type, given facilities + reception. */
  fair: Record<RoomKind, number>;
  /** How each asking price bends demand (1 = neutral, >1 = a bargain). */
  pull: Record<RoomKind, number>;
  costs: Costs;
  staffNeeded: number;
  understaffed: boolean;
  nextFloorCost: number;
  canAddFloor: boolean;
  receptionCost: number;
  receptionMax: number;
  /** The season of the week that is about to be played. */
  season: Season;
  last: WeekReport | null;
  /** Weeks remaining including the current one; null in relaxed mode. */
  weeksLeft: number | null;
  adCost: number;
  staffWage: number;
  roomsPerStaff: number;
  facilityUpkeep: number;
  floorUpkeep: number;
}

/** Mode config is opaque JSON from the lobby — treat every field as hostile. */
function intConfig(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max
    ? raw
    : fallback;
}

/** The week the last settled report covers — nicer than the pending week. */
function lastPlayedWeek(state: HotelState): number {
  return state.log[0]?.week ?? state.week;
}

function outcome(state: HotelState): GameResult | null {
  if (state.relaxed) return null;
  if (state.cash >= state.goal) {
    return { text: `🏨 Tycoon! ${money(state.cash)} by week ${lastPlayedWeek(state)}` };
  }
  if (state.cash < 0) {
    return { text: `💸 Bankrupt in week ${lastPlayedWeek(state)} — the bank took the keys` };
  }
  if (state.week > state.weeks) {
    return {
      text: `⏳ Time's up — ${money(state.cash)} of ${money(state.goal)} after ${state.weeks} weeks`,
    };
  }
  return null;
}

/** Every move but restart is refused once the run is over, or from the table. */
function blocked(state: HotelState, ctx: MoveCtx): boolean {
  return ctx.role === 'table' || outcome(state) !== null;
}

/** Validate a (floor, slot) pair from a client. Returns the floor, or null. */
function locate(state: HotelState, floor: unknown, slot: unknown): Floor | null {
  if (!Number.isInteger(floor) || !Number.isInteger(slot)) return null;
  const f = state.floors[floor as number];
  if (!f) return null;
  const s = slot as number;
  if (s < 0 || s >= f.slots.length) return null;
  return f;
}

function withSlot(state: HotelState, floor: number, slot: number, kind: SlotKind | null): Floor[] {
  return state.floors.map((f, i) =>
    i === floor ? { slots: f.slots.map((s, j) => (j === slot ? kind : s)) } : f,
  );
}

const game: GameDef<HotelState, HotelView> = {
  setup({ mode }) {
    const relaxed = mode.config['relaxed'] === true;
    const goal = intConfig(mode.config['goal'], 1000, 10_000_000, 50_000);
    const weeks = intConfig(mode.config['weeks'], 4, 200, 24);
    return freshState(relaxed, goal, weeks);
  },

  moves: {
    /** Stack another floor on top; every floor makes the next one dearer. */
    addFloor(state, ctx) {
      if (blocked(state, ctx)) return state;
      if (state.floors.length >= MAX_FLOORS) return state;
      const cost = floorCost(state.floors.length);
      if (state.cash < cost) return state;
      const slots = Array<SlotKind | null>(slotCount(state.floors.length)).fill(null);
      return { ...state, cash: state.cash - cost, floors: [...state.floors, { slots }] };
    },

    /** Put a room or a facility into an empty slot. */
    build(state, ctx, floor: number, slot: number, kind: SlotKind) {
      if (blocked(state, ctx)) return state;
      const f = locate(state, floor, slot);
      if (!f) return state;
      if (f.slots[slot] !== null) return state;
      if (!isSlotKind(kind)) return state;
      const spec = SPECS[kind];
      if (state.cash < spec.cost) return state;
      // one of each facility: a second pool would draw no extra guests
      if (isFacilityKind(kind) && facilityList(state.floors).includes(kind)) return state;
      return {
        ...state,
        cash: state.cash - spec.cost,
        floors: withSlot(state, floor, slot, kind),
      };
    },

    /** Tear a slot out; the salvage pays back a quarter of the build cost. */
    demolish(state, ctx, floor: number, slot: number) {
      if (blocked(state, ctx)) return state;
      const f = locate(state, floor, slot);
      if (!f) return state;
      const kind = f.slots[slot];
      if (!kind) return state;
      const refund = Math.round(SPECS[kind].cost * REFUND);
      return {
        ...state,
        cash: state.cash + refund,
        floors: withSlot(state, floor, slot, null),
      };
    },

    /** Nightly asking price for one room type, clamped to sane bounds. */
    setRate(state, ctx, kind: RoomKind, price: number) {
      if (blocked(state, ctx)) return state;
      if (!isRoomKind(kind)) return state;
      if (typeof price !== 'number' || !Number.isFinite(price)) return state;
      const next = clampRate(kind, price);
      if (next === state.rates[kind]) return state;
      return { ...state, rates: { ...state.rates, [kind]: next } };
    },

    /** Another star on the door: more pull, and guests accept higher rates. */
    upgradeReception(state, ctx) {
      if (blocked(state, ctx)) return state;
      if (state.receptionLevel >= RECEPTION_MAX) return state;
      const cost = receptionCost(state.receptionLevel);
      if (cost <= 0 || state.cash < cost) return state;
      return { ...state, cash: state.cash - cost, receptionLevel: state.receptionLevel + 1 };
    },

    /** Staff are paid weekly, never up front — hire ahead of the rooms. */
    hire(state, ctx) {
      if (blocked(state, ctx)) return state;
      if (state.staff >= MAX_STAFF) return state;
      return { ...state, staff: state.staff + 1 };
    },

    fire(state, ctx) {
      if (blocked(state, ctx)) return state;
      if (state.staff <= 0) return state;
      return { ...state, staff: state.staff - 1 };
    },

    /** A one-off campaign: +20% demand on the next week you settle. */
    advertise(state, ctx) {
      if (blocked(state, ctx)) return state;
      if (state.ad) return state;
      if (state.cash < AD_COST) return state;
      return { ...state, cash: state.cash - AD_COST, ad: true };
    },

    /** Settle the week: guests arrive, money moves, the calendar advances. */
    nextWeek(state, ctx) {
      if (blocked(state, ctx)) return state;
      return simulateWeek(state, ctx.random);
    },

    /** Fresh hotel, same mode. Allowed after the run ends — that is the point. */
    restart(state, ctx) {
      if (ctx.role === 'table') return state;
      return freshState(state.relaxed, state.goal, state.weeks);
    },
  },

  // a solo builder has nothing to hide: the view is the state plus the
  // numbers the phone would otherwise have to recompute
  playerView(state) {
    const rooms = roomCounts(state.floors);
    const facilities = facilityList(state.floors);
    const built = totalRooms(rooms);
    const fair = {} as Record<RoomKind, number>;
    const pull = {} as Record<RoomKind, number>;
    for (const kind of ROOM_KINDS) {
      fair[kind] = fairRate(kind, facilities.length, state.receptionLevel);
      pull[kind] = Math.round(priceFactor(state.rates[kind], fair[kind]) * 100) / 100;
    }
    return {
      ...state,
      rooms,
      roomsBuilt: built,
      beds: totalBeds(rooms),
      facilities,
      fair,
      pull,
      costs: weeklyCosts(state),
      staffNeeded: staffNeeded(built),
      understaffed: built > state.staff * ROOMS_PER_STAFF,
      nextFloorCost: floorCost(state.floors.length),
      canAddFloor: state.floors.length < MAX_FLOORS,
      receptionCost: receptionCost(state.receptionLevel),
      receptionMax: RECEPTION_MAX,
      season: seasonFor(state.week),
      last: state.log[0] ?? null,
      weeksLeft: state.relaxed ? null : Math.max(0, state.weeks - state.week + 1),
      adCost: AD_COST,
      staffWage: STAFF_WAGE,
      roomsPerStaff: ROOMS_PER_STAFF,
      facilityUpkeep: FACILITY_UPKEEP,
      floorUpkeep: FLOOR_UPKEEP,
    };
  },

  isOver: outcome,
};

export default game;
