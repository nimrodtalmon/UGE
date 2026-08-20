/**
 * Tiny City — the map, the price list and the yearly simulation.
 *
 * Everything here is pure and deterministic (randomness only ever arrives as
 * an injected `random()`), so the rules run it on the server and the views
 * import the same constants to label buttons with the same prices.
 */

export const W = 10;
export const H = 10;
export const SIZE = W * H;

export type Kind = 'empty' | 'water' | 'road' | 'house' | 'shop' | 'factory' | 'park' | 'plant';

/** Everything a player may place. Water is natural; empty is what's left. */
export const BUILD_KINDS = ['house', 'shop', 'factory', 'park', 'road', 'plant'] as const;
export type BuildKind = (typeof BUILD_KINDS)[number];

export const COST: Record<BuildKind, number> = {
  house: 100,
  shop: 250,
  factory: 400,
  park: 150,
  road: 50,
  plant: 900,
};
export const BULLDOZE_COST = 30;
export const START_MONEY = 6000;

export const ICON: Record<Kind, string> = {
  empty: '',
  water: '💧',
  road: '🛣️',
  house: '🏠',
  shop: '🏪',
  factory: '🏭',
  park: '🌳',
  plant: '⚡',
};

export const LABEL: Record<Kind, string> = {
  empty: 'land',
  water: 'water',
  road: 'road',
  house: 'homes',
  shop: 'shop',
  factory: 'factory',
  park: 'park',
  plant: 'power plant',
};

/** One plant powers this many connected buildings. */
export const PLANT_SUPPLY = 12;

/** Per-level output of one building at density level 1. */
export const HOUSE_CAPACITY = 4;
export const SHOP_JOBS = 3;
export const FACTORY_JOBS = 6;
export const SHOP_TAX = 20;

/**
 * Density: a block on its own is level 1, one walled in by neighbours is
 * level 5, and its output is multiplied by this table. Sprawl houses four
 * people, a downtown block houses a hundred — which is the only reason a
 * 10×10 map can ever hold two thousand mayoral voters. Tuned so a decent
 * city hits the Mayor goal around year 14–18 of 20.
 */
export const LEVEL_MULT = [1, 3, 8, 15, 25];
export const MAX_LEVEL = LEVEL_MULT.length;

export const TAX_PER_PERSON = 3;
export const ROAD_UPKEEP = 2;
export const PLANT_UPKEEP = 60;
export const PARK_UPKEEP = 10;

/** People move in this fast toward the city's capacity, and stop sulking below. */
export const GROWTH = 0.25;
export const HAPPY_STALL = 30;
export const BASE_HAPPINESS = 60;
/** Chebyshev radius for "a park / a factory near your house". */
export const AMENITY_RADIUS = 2;

export const LOG_KEEP = 8;

export type Status = 'playing' | 'won' | 'lost';
export type LostReason = 'bankrupt' | 'time' | null;
export type YearEvent = 'quiet' | 'boom' | 'fire';

export interface CityState {
  w: number;
  h: number;
  tiles: Kind[];
  money: number;
  year: number;
  population: number;
  happiness: number;
  /** Newest first, capped at LOG_KEEP. */
  log: string[];
  sandbox: boolean;
  /** Mayor mode only; 0 in sandbox. */
  goal: number;
  years: number;
  status: Status;
  lostReason: LostReason;
  /** The year the term ended (win or loss); null while playing. */
  endedYear: number | null;
}

/** The city as one device sees it — a solo game, so nothing is hidden. */
export interface CityView extends CityState {
  /** Per tile: unconnected or unpowered, i.e. contributing nothing. */
  warn: boolean[];
  /** Per tile: 1..5 density level for working structures, 0 elsewhere. */
  level: number[];
  stats: CityStats;
  books: CityBooks;
}

export interface CityStats {
  housing: number;
  jobs: number;
  /** People the city could hold right now: min(housing, jobs). */
  capacity: number;
  /** Shop takings — the half of the tax base that doesn't move. */
  shopTax: number;
  upkeep: number;
  powerCap: number;
  powerUse: number;
  /** Connected buildings sitting in the dark. */
  unpowered: number;
  /** Buildings with no road connection. */
  unconnected: number;
  counts: Record<Kind, number>;
}

/** The year's books at a given population. */
export interface CityBooks {
  taxes: number;
  upkeep: number;
  net: number;
}

export interface Analysis {
  connected: boolean[];
  /** Connected AND powered (parks and plants only need the connection). */
  working: boolean[];
  warn: boolean[];
  level: number[];
  stats: CityStats;
}

export const isStructure = (k: Kind): boolean =>
  k === 'house' || k === 'shop' || k === 'factory' || k === 'park' || k === 'plant';

/** Buildings that draw power. Parks need none, plants make it. */
export const isConsumer = (k: Kind): boolean => k === 'house' || k === 'shop' || k === 'factory';

export const isBuildKind = (k: string): k is BuildKind =>
  (BUILD_KINDS as readonly string[]).includes(k);

export const at = (tiles: Kind[], i: number): Kind => tiles[i] ?? 'empty';

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

const multOf = (level: number): number => LEVEL_MULT[clamp(level, 1, MAX_LEVEL) - 1] ?? 1;

function orth(i: number): number[] {
  const x = i % W;
  const y = Math.floor(i / W);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < W - 1) out.push(i + 1);
  if (y > 0) out.push(i - W);
  if (y < H - 1) out.push(i + W);
  return out;
}

function around(i: number): number[] {
  const x = i % W;
  const y = Math.floor(i / W);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) out.push(ny * W + nx);
    }
  }
  return out;
}

/** Every tile within Chebyshev distance `r` (excluding the tile itself). */
function withinRadius(i: number, r: number): number[] {
  const x = i % W;
  const y = Math.floor(i / W);
  const out: number[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) out.push(ny * W + nx);
    }
  }
  return out;
}

const emptyCounts = (): Record<Kind, number> => ({
  empty: 0,
  water: 0,
  road: 0,
  house: 0,
  shop: 0,
  factory: 0,
  park: 0,
  plant: 0,
});

/**
 * Flood fill from every road: a building is on the grid if it touches a road
 * or touches a building that does. One road tile can therefore serve a whole
 * blob — which is exactly what makes dense blocks worth building.
 */
function connectivity(tiles: Kind[]): boolean[] {
  const connected = Array<boolean>(SIZE).fill(false);
  const stack: number[] = [];
  for (let i = 0; i < SIZE; i++) {
    if (at(tiles, i) === 'road') {
      connected[i] = true;
      stack.push(i);
    }
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    for (const n of orth(i)) {
      if (connected[n]) continue;
      const k = at(tiles, n);
      if (k === 'road' || isStructure(k)) {
        connected[n] = true;
        stack.push(n);
      }
    }
  }
  return connected;
}

/** Connectivity, power, density and the year's books — everything derived. */
export function analyze(tiles: Kind[]): Analysis {
  const connected = connectivity(tiles);
  const level = Array<number>(SIZE).fill(0);
  const working = Array<boolean>(SIZE).fill(false);
  const warn = Array<boolean>(SIZE).fill(false);
  const counts = emptyCounts();

  let powerCap = 0;
  for (let i = 0; i < SIZE; i++) {
    const k = at(tiles, i);
    counts[k] += 1;
    if (k === 'plant' && connected[i]) powerCap += PLANT_SUPPLY;
    if (isStructure(k) && connected[i]) {
      let neighbours = 0;
      for (const n of around(i)) if (isStructure(at(tiles, n)) && connected[n]) neighbours += 1;
      level[i] = Math.min(MAX_LEVEL, 1 + Math.floor(neighbours / 2));
    }
  }

  // power goes out in reading order — deterministic, and the dark corner is
  // always the same one until another plant goes up
  let powerUse = 0;
  let unpowered = 0;
  let unconnected = 0;
  for (let i = 0; i < SIZE; i++) {
    const k = at(tiles, i);
    if (!isStructure(k)) continue;
    if (!connected[i]) {
      unconnected += 1;
      warn[i] = true;
      continue;
    }
    if (isConsumer(k)) {
      if (powerUse < powerCap) {
        powerUse += 1;
        working[i] = true;
      } else {
        unpowered += 1;
        warn[i] = true;
      }
    } else {
      working[i] = true;
    }
  }

  let housing = 0;
  let jobs = 0;
  let shopTax = 0;
  for (let i = 0; i < SIZE; i++) {
    if (!working[i]) continue;
    const mult = multOf(level[i] ?? 1);
    const k = at(tiles, i);
    if (k === 'house') housing += HOUSE_CAPACITY * mult;
    else if (k === 'shop') {
      jobs += SHOP_JOBS * mult;
      shopTax += SHOP_TAX * mult;
    } else if (k === 'factory') jobs += FACTORY_JOBS * mult;
  }

  const upkeep =
    counts.road * ROAD_UPKEEP + counts.plant * PLANT_UPKEEP + counts.park * PARK_UPKEEP;
  return {
    connected,
    working,
    warn,
    level,
    stats: {
      housing,
      jobs,
      capacity: Math.min(housing, jobs),
      shopTax,
      upkeep,
      powerCap,
      powerUse,
      unpowered,
      unconnected,
      counts,
    },
  };
}

/** Head tax plus shop takings. */
export const taxesOf = (population: number, a: Analysis): number =>
  population * TAX_PER_PERSON + a.stats.shopTax;

/** What the treasury would see this year at the given population. */
export function booksOf(population: number, a: Analysis): CityBooks {
  const taxes = taxesOf(population, a);
  return { taxes, upkeep: a.stats.upkeep, net: taxes - a.stats.upkeep };
}

/**
 * Happiness, recomputed from the map every year (never drifting):
 * parks lift a neighbourhood, factories smother it, a blackout is felt by
 * everyone, and a city with room to work is a city worth moving to.
 */
export function happinessOf(tiles: Kind[], a: Analysis): number {
  let greenParks = 0;
  let smokyFactories = 0;
  for (let i = 0; i < SIZE; i++) {
    const k = at(tiles, i);
    if (k !== 'park' && k !== 'factory') continue;
    if (k === 'park' && !a.working[i]) continue;
    const near = withinRadius(i, AMENITY_RADIUS).some(
      (n) => at(tiles, n) === 'house' && a.working[n],
    );
    if (!near) continue;
    if (k === 'park') greenParks += 1;
    else smokyFactories += 1;
  }
  let happy = BASE_HAPPINESS;
  happy += Math.min(20, 2 * greenParks);
  happy -= smokyFactories;
  if (a.stats.unpowered > 0) happy -= 10;
  if (a.stats.jobs >= a.stats.housing) happy += 5;
  return clamp(happy, 0, 100);
}

/**
 * People move toward the city's capacity — a quarter of the gap a year, plus
 * one so a tiny city still starts. Lose the housing or the jobs and they
 * leave the same day; a miserable city simply stops growing.
 */
export function grownPopulation(population: number, capacity: number, happiness: number): number {
  if (population > capacity) return capacity;
  if (happiness < HAPPY_STALL) return population;
  const gap = capacity - population;
  if (gap <= 0) return population;
  return population + Math.min(gap, Math.floor(gap * GROWTH) + 1);
}

/** A fresh map: one small lake and the one road the city grew around. */
export function freshTiles(random: () => number): Kind[] {
  const tiles = Array<Kind>(SIZE).fill('empty');
  let x = 1 + Math.floor(random() * (W - 2));
  let y = 1 + Math.floor(random() * (H - 2));
  const drops = 6 + Math.floor(random() * 4);
  for (let n = 0; n < drops; n++) {
    tiles[y * W + x] = 'water';
    const step = Math.floor(random() * 4);
    if (step === 0 && x > 0) x -= 1;
    else if (step === 1 && x < W - 1) x += 1;
    else if (step === 2 && y > 0) y -= 1;
    else if (y < H - 1) y += 1;
  }
  // the road goes on the most central patch of dry land
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < SIZE; i++) {
    if (at(tiles, i) !== 'empty') continue;
    const dx = (i % W) - (W - 1) / 2;
    const dy = Math.floor(i / W) - (H - 1) / 2;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  if (best >= 0) tiles[best] = 'road';
  return tiles;
}

export function freshCity(
  random: () => number,
  opts: { sandbox: boolean; goal: number; years: number },
): CityState {
  return {
    w: W,
    h: H,
    tiles: freshTiles(random),
    money: START_MONEY,
    year: 1,
    population: 0,
    happiness: BASE_HAPPINESS,
    log: [
      opts.sandbox
        ? 'Year 1 · a lake, a road and $6,000. Build whatever you like.'
        : `Year 1 · ${opts.goal} people in ${opts.years} years. Good luck, mayor.`,
    ],
    sandbox: opts.sandbox,
    goal: opts.sandbox ? 0 : opts.goal,
    years: opts.sandbox ? 0 : opts.years,
    status: 'playing',
    lostReason: null,
    endedYear: null,
  };
}

const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** The one random event of the year, rolled before anything is counted. */
function rollEvent(
  tiles: Kind[],
  random: () => number,
): { tiles: Kind[]; event: YearEvent; note: string } {
  const roll = random();
  if (roll < 0.12) {
    const targets: number[] = [];
    for (let i = 0; i < SIZE; i++) if (isStructure(at(tiles, i))) targets.push(i);
    if (targets.length > 0) {
      const hit = targets[Math.floor(random() * targets.length)] ?? targets[0]!;
      const razed = [...tiles];
      const kind = at(tiles, hit);
      razed[hit] = 'empty';
      return { tiles: razed, event: 'fire', note: `🔥 fire razed a ${LABEL[kind]}` };
    }
    return { tiles, event: 'quiet', note: '🌾 a quiet year' };
  }
  if (roll < 0.32) return { tiles, event: 'boom', note: '📈 boom year — taxes +20%' };
  return { tiles, event: 'quiet', note: '🌾 a quiet year' };
}

/** Advance the city one year: event, then the books, then the calendar. */
export function advance(state: CityState, random: () => number): CityState {
  const year = state.year;
  const rolled = rollEvent(state.tiles, random);
  const tiles = rolled.tiles;

  const a = analyze(tiles);
  const happiness = happinessOf(tiles, a);
  const population = grownPopulation(state.population, a.stats.capacity, happiness);
  const taxes = Math.floor(taxesOf(population, a) * (rolled.event === 'boom' ? 1.2 : 1));
  const upkeep = a.stats.upkeep;
  const money = state.money + taxes - upkeep;

  let status: Status = state.status;
  let lostReason: LostReason = state.lostReason;
  let endedYear: number | null = state.endedYear;
  if (!state.sandbox) {
    if (population >= state.goal) status = 'won';
    else if (money < 0) {
      status = 'lost';
      lostReason = 'bankrupt';
    } else if (year >= state.years) {
      status = 'lost';
      lostReason = 'time';
    }
    if (status !== 'playing') endedYear = year;
  }

  const line = [
    `Y${year}`,
    `👥 ${population} (${signed(population - state.population)})`,
    `🙂 ${happiness}`,
    `💰 ${signed(taxes - upkeep)}`,
    rolled.note,
  ].join(' · ');

  return {
    ...state,
    tiles,
    money,
    year: year + 1,
    population,
    happiness,
    log: [line, ...state.log].slice(0, LOG_KEEP),
    status,
    lostReason,
    endedYear,
  };
}
