/**
 * Hotel Empire's economy: the price list, the weekly simulation and the
 * derived numbers both game.ts and the views need (what a slot costs, what a
 * rate is worth, what next week's season does to demand).
 *
 * Everything here is a pure function of state (plus an injected `random` for
 * the weekly swing) — no clocks, no globals. The state shape lives here too
 * so the simulation can own it; game.ts re-exports it for the views.
 *
 * The whole game is public information, so nothing here is secret — the
 * interest comes from the trade-off between capacity, demand and upkeep.
 */

export type RoomKind = 'single' | 'double' | 'suite';
export type FacilityKind = 'restaurant' | 'pool' | 'spa' | 'gym';
export type SlotKind = RoomKind | FacilityKind;

export interface SlotSpec {
  kind: SlotKind;
  name: string;
  icon: string;
  cost: number;
  /** Rooms sell nights; facilities pull demand (and cost weekly upkeep). */
  room: boolean;
  /** Guests per night — rooms only. */
  sleeps: number;
  /** Nightly asking price a fresh hotel starts at — rooms only. */
  baseRate: number;
  blurb: string;
}

export const ROOM_KINDS: RoomKind[] = ['single', 'double', 'suite'];
export const FACILITY_KINDS: FacilityKind[] = ['restaurant', 'pool', 'spa', 'gym'];

export const SPECS: Record<SlotKind, SlotSpec> = {
  single: {
    kind: 'single',
    name: 'Single',
    icon: '🛏️',
    cost: 800,
    room: true,
    sleeps: 1,
    baseRate: 60,
    blurb: 'sleeps 1 · cheap to build',
  },
  double: {
    kind: 'double',
    name: 'Double',
    icon: '🛏️🛏️',
    cost: 1400,
    room: true,
    sleeps: 2,
    baseRate: 95,
    blurb: 'sleeps 2 · the workhorse',
  },
  suite: {
    kind: 'suite',
    name: 'Suite',
    icon: '🛋️',
    cost: 3000,
    room: true,
    sleeps: 2,
    baseRate: 210,
    blurb: 'sleeps 2 · high rate',
  },
  restaurant: {
    kind: 'restaurant',
    name: 'Restaurant',
    icon: '🍽️',
    cost: 2500,
    room: false,
    sleeps: 0,
    baseRate: 0,
    blurb: '+2 demand · raises fair rates',
  },
  pool: {
    kind: 'pool',
    name: 'Pool',
    icon: '🏊',
    cost: 3500,
    room: false,
    sleeps: 0,
    baseRate: 0,
    blurb: '+2 demand · raises fair rates',
  },
  spa: {
    kind: 'spa',
    name: 'Spa',
    icon: '💆',
    cost: 4000,
    room: false,
    sleeps: 0,
    baseRate: 0,
    blurb: '+2 demand · raises fair rates',
  },
  gym: {
    kind: 'gym',
    name: 'Gym',
    icon: '🏋️',
    cost: 1800,
    room: false,
    sleeps: 0,
    baseRate: 0,
    blurb: '+2 demand · raises fair rates',
  },
};

// ---- tuning knobs, all in one place -----------------------------------

export const START_CASH = 10_000;
export const START_STAFF = 1;
export const START_REPUTATION = 50;
/** Nights sold per week — the whole week is priced as seven identical nights. */
export const NIGHTS = 7;
export const STAFF_WAGE = 250;
export const ROOMS_PER_STAFF = 6;
export const FACILITY_UPKEEP = 120;
export const FLOOR_UPKEEP = 60;
/** A new floor costs this much per floor already standing. */
export const FLOOR_COST_STEP = 2000;
export const MAX_FLOORS = 8;
/** The ground floor shares its footprint with the reception. */
export const GROUND_SLOTS = 2;
export const FLOOR_SLOTS = 4;
export const MAX_STAFF = 40;
export const AD_COST = 600;
export const AD_BONUS = 1.2;
/** Demolishing pays back this share of the build cost. */
export const REFUND = 0.25;
export const RECEPTION_MAX = 5;
/** Reception upgrades: each level pulls guests and lets you charge more. */
export const RECEPTION_STEP = 1200;
export const LOG_WEEKS = 8;
export const RATE_MIN = 10;
/** Nobody pays more than four times the going rate, so the stepper stops there. */
export const RATE_MAX_MULTIPLE = 4;

export interface Floor {
  /** Fixed length: GROUND_SLOTS on the ground floor, FLOOR_SLOTS above. */
  slots: (SlotKind | null)[];
}

/** One finished week, kept for the report card and the table's ledger. */
export interface WeekReport {
  week: number;
  season: string;
  seasonIcon: string;
  ad: boolean;
  /** Heads in beds (a full double counts two). */
  guests: number;
  occupied: number;
  rooms: number;
  /** 0..1 — occupied rooms over rooms built. */
  occupancy: number;
  revenue: number;
  costs: number;
  profit: number;
  reputation: number;
  repDelta: number;
  understaffed: boolean;
  sold: Record<RoomKind, number>;
}

export interface HotelState {
  cash: number;
  /** The week about to be played; the first nextWeek() settles week 1. */
  week: number;
  floors: Floor[];
  receptionLevel: number;
  staff: number;
  rates: Record<RoomKind, number>;
  /** 0..100, one decimal. */
  reputation: number;
  /** Advertising paid for — spends itself on the coming week. */
  ad: boolean;
  /** Newest first, at most LOG_WEEKS entries. */
  log: WeekReport[];
  // mode settings, frozen at setup so restart() can rebuild the same game
  relaxed: boolean;
  goal: number;
  weeks: number;
}

export interface Season {
  label: string;
  icon: string;
  factor: number;
}

/**
 * A year is twelve weeks long here, so a 24-week tycoon run sees two summers.
 * Deliberately a table rather than a sine: it is readable and tweakable.
 */
export const SEASON_CYCLE: Season[] = [
  { label: 'off season', icon: '❄️', factor: 0.8 },
  { label: 'off season', icon: '❄️', factor: 0.85 },
  { label: 'spring', icon: '🌱', factor: 0.95 },
  { label: 'spring', icon: '🌱', factor: 1.05 },
  { label: 'early summer', icon: '🌤️', factor: 1.15 },
  { label: 'summer', icon: '☀️', factor: 1.3 },
  { label: 'high season', icon: '☀️', factor: 1.4 },
  { label: 'summer', icon: '☀️', factor: 1.3 },
  { label: 'autumn', icon: '🍂', factor: 1.1 },
  { label: 'autumn', icon: '🍂', factor: 0.95 },
  { label: 'rainy', icon: '🌧️', factor: 0.85 },
  { label: 'off season', icon: '❄️', factor: 0.8 },
];

export function seasonFor(week: number): Season {
  const i = ((Math.max(1, Math.floor(week)) - 1) % SEASON_CYCLE.length + SEASON_CYCLE.length) % SEASON_CYCLE.length;
  return SEASON_CYCLE[i] ?? { label: 'off season', icon: '❄️', factor: 1 };
}

// ---- small guards, used on every hostile move argument ------------------

export function isRoomKind(kind: unknown): kind is RoomKind {
  return typeof kind === 'string' && (ROOM_KINDS as string[]).includes(kind);
}

export function isFacilityKind(kind: unknown): kind is FacilityKind {
  return typeof kind === 'string' && (FACILITY_KINDS as string[]).includes(kind);
}

export function isSlotKind(kind: unknown): kind is SlotKind {
  return isRoomKind(kind) || isFacilityKind(kind);
}

/** Slots a given floor offers — the ground floor gives two up to the reception. */
export function slotCount(floorIndex: number): number {
  return floorIndex === 0 ? GROUND_SLOTS : FLOOR_SLOTS;
}

export function floorCost(floorsBuilt: number): number {
  return FLOOR_COST_STEP * floorsBuilt;
}

/** Cost of the next reception star; 0 once the top level is reached. */
export function receptionCost(level: number): number {
  return level >= RECEPTION_MAX ? 0 : RECEPTION_STEP * level;
}

export function clampRate(kind: RoomKind, price: number): number {
  const max = SPECS[kind].baseRate * RATE_MAX_MULTIPLE;
  return Math.max(RATE_MIN, Math.min(max, Math.round(price)));
}

export function rateMax(kind: RoomKind): number {
  return SPECS[kind].baseRate * RATE_MAX_MULTIPLE;
}

// ---- reading the tower --------------------------------------------------

export function roomCounts(floors: Floor[]): Record<RoomKind, number> {
  const counts: Record<RoomKind, number> = { single: 0, double: 0, suite: 0 };
  for (const floor of floors) {
    for (const slot of floor.slots) {
      if (isRoomKind(slot)) counts[slot] += 1;
    }
  }
  return counts;
}

/** Which facilities the hotel has — at most one of each kind. */
export function facilityList(floors: Floor[]): FacilityKind[] {
  const out: FacilityKind[] = [];
  for (const floor of floors) {
    for (const slot of floor.slots) {
      if (isFacilityKind(slot) && !out.includes(slot)) out.push(slot);
    }
  }
  return out;
}

export function totalRooms(counts: Record<RoomKind, number>): number {
  return counts.single + counts.double + counts.suite;
}

export function totalBeds(counts: Record<RoomKind, number>): number {
  return ROOM_KINDS.reduce((sum, kind) => sum + counts[kind] * SPECS[kind].sleeps, 0);
}

/**
 * What guests consider a fair nightly price: the room's base rate, lifted by
 * every facility (6% each) and by the reception's stars (4% each).
 */
export function fairRate(kind: RoomKind, facilities: number, receptionLevel: number): number {
  const lift = 1 + facilities * 0.06 + (receptionLevel - 1) * 0.04;
  return Math.round(SPECS[kind].baseRate * lift);
}

/**
 * How your asking price bends demand: at the fair rate nothing changes, a
 * bargain pulls a little extra, gouging empties the floor.
 */
export function priceFactor(rate: number, fair: number): number {
  if (fair <= 0) return 1;
  return Math.max(0.1, Math.min(1.4, 2 - rate / fair));
}

export interface Costs {
  wages: number;
  facilities: number;
  floors: number;
  total: number;
}

export function weeklyCosts(state: HotelState): Costs {
  const wages = state.staff * STAFF_WAGE;
  const facilities = facilityList(state.floors).length * FACILITY_UPKEEP;
  const floors = state.floors.length * FLOOR_UPKEEP;
  return { wages, facilities, floors, total: wages + facilities + floors };
}

export function staffNeeded(rooms: number): number {
  return Math.ceil(rooms / ROOMS_PER_STAFF);
}

export function isUnderstaffed(state: HotelState): boolean {
  return totalRooms(roomCounts(state.floors)) > state.staff * ROOMS_PER_STAFF;
}

// ---- the weekly simulation ---------------------------------------------

export function freshState(relaxed: boolean, goal: number, weeks: number): HotelState {
  return {
    cash: START_CASH,
    week: 1,
    floors: [{ slots: Array<SlotKind | null>(GROUND_SLOTS).fill(null) }],
    receptionLevel: 1,
    staff: START_STAFF,
    rates: { single: SPECS.single.baseRate, double: SPECS.double.baseRate, suite: SPECS.suite.baseRate },
    reputation: START_REPUTATION,
    ad: false,
    log: [],
    relaxed,
    goal,
    weeks,
  };
}

function clampReputation(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

/**
 * Reputation drifts on three things: staffing, having something to do, and
 * whether the price feels fair. It feeds next week's demand, so a well-run
 * cheap hotel compounds and a gouging one bleeds guests.
 */
function reputationDelta(opts: {
  rooms: number;
  facilities: number;
  understaffed: boolean;
  priceRatio: number;
}): number {
  if (opts.rooms === 0) return -2; // an empty lot impresses nobody
  let delta = opts.understaffed ? -6 : 1;
  delta += opts.facilities === 0 ? -1 : Math.min(4, opts.facilities) * 0.75;
  delta += opts.priceRatio <= 1 ? 1 : -Math.min(12, (opts.priceRatio - 1) * 20);
  return delta;
}

/** Settle the current week and roll the calendar forward one step. */
export function simulateWeek(state: HotelState, random: () => number): HotelState {
  const counts = roomCounts(state.floors);
  const rooms = totalRooms(counts);
  const facilities = facilityList(state.floors).length;
  const season = seasonFor(state.week);

  // demand, in rooms wanted this week
  const swing = (random() * 2 - 1) * 2;
  const base =
    8 + 2 * facilities + (state.receptionLevel - 1) * 2 + state.reputation / 10 + swing;
  const demand = Math.max(0, base) * season.factor * (state.ad ? AD_BONUS : 1);

  const sold: Record<RoomKind, number> = { single: 0, double: 0, suite: 0 };
  let revenue = 0;
  let guests = 0;
  let occupied = 0;
  let ratioWeight = 0;

  for (const kind of ROOM_KINDS) {
    const capacity = counts[kind];
    if (capacity === 0) continue;
    const fair = fairRate(kind, facilities, state.receptionLevel);
    const rate = state.rates[kind];
    ratioWeight += capacity * (fair > 0 ? rate / fair : 1);
    // the market splits across your room mix, then price bends each share
    const want = demand * (capacity / rooms) * priceFactor(rate, fair);
    const taken = Math.max(0, Math.min(capacity, Math.round(want)));
    sold[kind] = taken;
    occupied += taken;
    guests += taken * SPECS[kind].sleeps;
    revenue += taken * rate * NIGHTS;
  }

  const costs = weeklyCosts(state);
  const profit = revenue - costs.total;
  const understaffed = rooms > state.staff * ROOMS_PER_STAFF;
  const priceRatio = rooms > 0 ? ratioWeight / rooms : 1;
  const reputation = clampReputation(
    state.reputation + reputationDelta({ rooms, facilities, understaffed, priceRatio }),
  );

  const report: WeekReport = {
    week: state.week,
    season: season.label,
    seasonIcon: season.icon,
    ad: state.ad,
    guests,
    occupied,
    rooms,
    occupancy: rooms > 0 ? occupied / rooms : 0,
    revenue,
    costs: costs.total,
    profit,
    reputation,
    repDelta: Math.round((reputation - state.reputation) * 10) / 10,
    understaffed,
    sold,
  };

  return {
    ...state,
    cash: state.cash + profit,
    week: state.week + 1,
    ad: false,
    reputation,
    log: [report, ...state.log].slice(0, LOG_WEEKS),
  };
}

/** `$12,340` — used by isOver's text and by every view. */
export function money(amount: number): string {
  const rounded = Math.round(amount);
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '−$' : '$'}${digits}`;
}
