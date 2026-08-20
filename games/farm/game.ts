import type { GameDef } from '../../src/shared/plugin.js';
import {
  ANIMALS,
  BASE_ENERGY,
  BOOTS_COST,
  BOOTS_ENERGY,
  CROPS,
  GOOD_IDS,
  GOODS,
  LOG_KEEP,
  PLOTS,
  PRODUCE_CAP,
  START_MONEY,
  barnCount,
  barnValue,
  basePrices,
  emptyBarn,
  emptyPlot,
  isRipe,
  parseCrop,
  parsePen,
  parsePlotIndex,
  rainChance,
  rollPrices,
} from './lib.js';
import type { GoodId, Plot } from './lib.js';

/**
 * Little Farm — a one-player builder. Days are turns: you spend energy on the
 * field, then hit "end day" and the farm simulates one night (growth, rain,
 * animals, market). Nothing ticks on its own, so the platform's polling sync
 * is all this needs.
 *
 * Nothing is hidden: playerView ships the whole state plus a few derived
 * numbers the views would otherwise recompute.
 */

export interface FarmLog {
  /** The day this happened on. */
  day: number;
  text: string;
}

export interface FarmState {
  plots: Plot[];
  money: number;
  day: number;
  energy: number;
  /** Energy handed out each morning — BASE_ENERGY, or BOOTS_ENERGY with boots. */
  maxEnergy: number;
  barn: Record<GoodId, number>;
  /** Today's market, redrawn every night. */
  prices: Record<GoodId, number>;
  boots: boolean;
  /** It rained overnight — today's watering was free. */
  rainToday: boolean;
  /** Newest first, LOG_KEEP entries. */
  log: FarmLog[];
  /** Season mode: money target and the last day. Both null in chill mode. */
  goal: number | null;
  limit: number | null;
}

export interface FarmView extends FarmState {
  /** What the barn would fetch at today's prices. */
  barnValue: number;
  barnCount: number;
  /** Crops standing ripe, crops still dry today, pens holding produce. */
  ripe: number;
  thirsty: number;
  readyPens: number;
  /** Season mode: days including today; null in chill mode. */
  daysLeft: number | null;
}

const freshPlots = (): Plot[] => Array.from({ length: PLOTS }, emptyPlot);

function fresh(goal: number | null, limit: number | null): FarmState {
  return {
    plots: freshPlots(),
    money: START_MONEY,
    day: 1,
    energy: BASE_ENERGY,
    maxEnergy: BASE_ENERGY,
    barn: emptyBarn(),
    prices: basePrices(),
    boots: false,
    rainToday: false,
    log: [],
    goal,
    limit,
  };
}

/** Mode config is opaque JSON from the lobby — clamp anything that came in. */
function readInt(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

const note = (state: FarmState, day: number, text: string): FarmLog[] =>
  [{ day, text }, ...state.log].slice(0, LOG_KEEP);

/** Replace one plot without touching the rest of the field. */
function withPlot(state: FarmState, i: number, plot: Plot): FarmState {
  const plots = [...state.plots];
  plots[i] = plot;
  return { ...state, plots };
}

/** The plot a move names, or null when the index is junk. */
function plotAt(state: FarmState, i: unknown): { index: number; plot: Plot } | null {
  const index = parsePlotIndex(i);
  if (index === null) return null;
  const plot = state.plots[index];
  return plot ? { index, plot } : null;
}

/** Every field action costs a point of the day's energy. */
const hasEnergy = (state: FarmState): boolean => state.energy >= 1;

/** "3🎃 2🥚" — what a sale contained, for the day log. */
function barnSummary(barn: Record<GoodId, number>): string {
  const parts: string[] = [];
  for (const id of GOOD_IDS) if (barn[id] > 0) parts.push(`${barn[id]}${GOODS[id].emoji}`);
  return parts.join(' ');
}

/** One night on the farm: growth, rain for the morning, animals, market. */
function night(state: FarmState, random: () => number): FarmState {
  const plots = state.plots.map((p) => ({ ...p }));
  let grew = 0;
  let withered = 0;
  let died = 0;
  let produced = 0;

  for (const p of plots) {
    if (p.kind === 'crop' && p.crop !== null) {
      const def = CROPS[p.crop];
      if (p.watered) {
        if (p.stage < def.days) {
          p.stage += 1;
          grew += 1;
        }
        p.dry = 0;
      } else {
        p.dry += 1;
        if (p.dry >= 3) {
          p.kind = 'dead';
          died += 1;
        } else if (p.dry === 2) {
          // a second dry day costs it the progress the first one stalled
          if (p.stage > 0) p.stage -= 1;
          withered += 1;
        }
      }
      p.watered = false;
    } else if (p.kind === 'pen' && p.animal !== null) {
      p.watered = false;
      const def = ANIMALS[p.animal];
      // a full pen stops working — nothing piles up past the cap
      if (p.produce < PRODUCE_CAP) {
        p.cycle += 1;
        if (p.cycle >= def.period) {
          p.cycle = 0;
          p.produce += 1;
          produced += 1;
        }
      }
    } else {
      p.watered = false;
    }
  }

  // rain falls for the morning, so it is a free watering you can see and use
  const rained = random() < rainChance(state.day + 1);
  if (rained) for (const p of plots) if (p.kind === 'crop') p.watered = true;

  const bits: string[] = [];
  if (grew > 0) bits.push(`🌱 ${grew} grew`);
  if (withered > 0) bits.push(`🥀 ${withered} withered`);
  if (died > 0) bits.push(`💀 ${died} died`);
  if (produced > 0) bits.push(`🧺 ${produced} produce`);
  if (rained) bits.push('🌧 rain overnight');
  if (bits.length === 0) bits.push('a quiet night');

  return {
    ...state,
    plots,
    day: state.day + 1,
    energy: state.maxEnergy,
    prices: rollPrices(random),
    rainToday: rained,
    log: note(state, state.day, bits.join(' · ')),
  };
}

const game: GameDef<FarmState, FarmView> = {
  setup({ mode }) {
    const chill = mode.config['chill'] === true;
    if (chill) return fresh(null, null);
    return fresh(
      readInt(mode.config['goal'], 3000, 100, 1_000_000),
      readInt(mode.config['days'], 40, 1, 999),
    );
  },

  moves: {
    /** Break dirt (or clear a dead plant) into a bed ready for seed. */
    till(state, ctx, i: number) {
      if (ctx.role === 'table') return state; // the table is display-only
      const target = plotAt(state, i);
      if (!target || !hasEnergy(state)) return state;
      if (target.plot.kind !== 'dirt' && target.plot.kind !== 'dead') return state;
      const tilled = { ...emptyPlot(), kind: 'tilled' as const };
      return withPlot({ ...state, energy: state.energy - 1 }, target.index, tilled);
    },

    plant(state, ctx, i: number, crop: string) {
      if (ctx.role === 'table') return state;
      const target = plotAt(state, i);
      const id = parseCrop(crop);
      if (!target || id === null || !hasEnergy(state)) return state;
      if (target.plot.kind !== 'tilled') return state;
      const seed = CROPS[id].seed;
      if (state.money < seed) return state;
      const planted: Plot = { ...emptyPlot(), kind: 'crop', crop: id };
      return withPlot(
        { ...state, energy: state.energy - 1, money: state.money - seed },
        target.index,
        planted,
      );
    },

    water(state, ctx, i: number) {
      if (ctx.role === 'table') return state;
      const target = plotAt(state, i);
      if (!target || !hasEnergy(state)) return state;
      if (target.plot.kind !== 'crop' || target.plot.watered) return state;
      // watering ends the dry streak right away, so the warning clears on tap
      const plot: Plot = { ...target.plot, watered: true, dry: 0 };
      return withPlot({ ...state, energy: state.energy - 1 }, target.index, plot);
    },

    harvest(state, ctx, i: number) {
      if (ctx.role === 'table') return state;
      const target = plotAt(state, i);
      if (!target || !hasEnergy(state)) return state;
      const crop = target.plot.crop;
      if (crop === null || !isRipe(target.plot)) return state;
      const barn = { ...state.barn, [crop]: state.barn[crop] + 1 };
      // a harvested bed goes back to plain dirt: replanting means tilling again
      return withPlot(
        { ...state, energy: state.energy - 1, barn },
        target.index,
        emptyPlot(),
      );
    },

    /** Gather everything a pen has been holding, in one trip. */
    collect(state, ctx, i: number) {
      if (ctx.role === 'table') return state;
      const target = plotAt(state, i);
      if (!target || !hasEnergy(state)) return state;
      const animal = target.plot.animal;
      if (target.plot.kind !== 'pen' || animal === null || target.plot.produce < 1) return state;
      const good = ANIMALS[animal].good;
      const barn = { ...state.barn, [good]: state.barn[good] + target.plot.produce };
      const plot: Plot = { ...target.plot, produce: 0 };
      return withPlot({ ...state, energy: state.energy - 1, barn }, target.index, plot);
    },

    /** Pens cost money, not energy — building one is a purchase, not a chore. */
    buyPen(state, ctx, i: number, kind: string) {
      if (ctx.role === 'table') return state;
      const target = plotAt(state, i);
      const animal = parsePen(kind);
      if (!target || animal === null) return state;
      if (target.plot.kind !== 'dirt') return state;
      const def = ANIMALS[animal];
      if (state.money < def.cost) return state;
      const plot: Plot = { ...emptyPlot(), kind: 'pen', animal };
      const spent = { ...state, money: state.money - def.cost };
      return withPlot(
        { ...spent, log: note(state, state.day, `${def.emoji} built a ${def.name} pen`) },
        target.index,
        plot,
      );
    },

    buyUpgrade(state, ctx, id: string) {
      if (ctx.role === 'table') return state;
      if (id !== 'boots') return state;
      if (state.boots || state.money < BOOTS_COST) return state;
      return {
        ...state,
        money: state.money - BOOTS_COST,
        boots: true,
        maxEnergy: BOOTS_ENERGY,
        log: note(state, state.day, `🥾 boots — ${BOOTS_ENERGY} energy from tomorrow`),
      };
    },

    sellAll(state, ctx) {
      if (ctx.role === 'table') return state;
      const total = barnValue(state.barn, state.prices);
      if (total <= 0) return state;
      const what = barnSummary(state.barn);
      return {
        ...state,
        money: state.money + total,
        barn: emptyBarn(),
        log: note(state, state.day, `💰 sold ${what} for $${total}`),
      };
    },

    endDay(state, ctx) {
      if (ctx.role === 'table') return state;
      if (state.limit !== null && state.day > state.limit) return state;
      return night(state, ctx.random);
    },

    /** Same mode, fresh farm — chill mode never ends, so it needs its own reset. */
    restart(state, ctx) {
      if (ctx.role === 'table') return state;
      return fresh(state.goal, state.limit);
    },
  },

  playerView(state) {
    let ripe = 0;
    let thirsty = 0;
    let readyPens = 0;
    for (const p of state.plots) {
      if (isRipe(p)) ripe += 1;
      else if (p.kind === 'crop' && !p.watered) thirsty += 1;
      if (p.kind === 'pen' && p.produce > 0) readyPens += 1;
    }
    return {
      ...state,
      barnValue: barnValue(state.barn, state.prices),
      barnCount: barnCount(state.barn),
      ripe,
      thirsty,
      readyPens,
      daysLeft: state.limit === null ? null : Math.max(0, state.limit - state.day + 1),
    };
  },

  isOver(state) {
    if (state.goal === null || state.limit === null) return null; // chill: farm forever
    if (state.money >= state.goal) {
      return { text: `🚜 Harvest complete — $${state.money} in ${state.day} days!` };
    }
    if (state.day > state.limit) {
      return { text: `🍂 Season over — $${state.money} of $${state.goal}` };
    }
    return null;
  },
};

export default game;
