/**
 * Farm data: crops, animals, market goods, and the plot record they all live
 * in. Shared by the rules (game.ts) and the views, so a price or a seed cost
 * is written down exactly once.
 */

export const FIELD = 6;
export const PLOTS = FIELD * FIELD;

export const START_MONEY = 200;
export const BASE_ENERGY = 10;
export const BOOTS_ENERGY = 14;
export const BOOTS_COST = 500;

/** A pen holds this much produce; a full pen stalls until it is collected. */
export const PRODUCE_CAP = 3;

/** Day log length kept in state (newest first). */
export const LOG_KEEP = 8;

export type CropId = 'wheat' | 'carrot' | 'tomato' | 'pumpkin';
export type PenKind = 'chicken' | 'cow';
export type GoodId = CropId | 'egg' | 'milk';

/** Anything the barn can hold and the market can price. */
export interface GoodDef {
  id: GoodId;
  name: string;
  emoji: string;
  /** Price the market wobbles around. */
  base: number;
}

export const GOODS: Record<GoodId, GoodDef> = {
  wheat: { id: 'wheat', name: 'Wheat', emoji: '🌾', base: 30 },
  carrot: { id: 'carrot', name: 'Carrot', emoji: '🥕', base: 70 },
  tomato: { id: 'tomato', name: 'Tomato', emoji: '🍅', base: 120 },
  pumpkin: { id: 'pumpkin', name: 'Pumpkin', emoji: '🎃', base: 240 },
  egg: { id: 'egg', name: 'Egg', emoji: '🥚', base: 25 },
  milk: { id: 'milk', name: 'Milk', emoji: '🥛', base: 70 },
};

export const GOOD_IDS: GoodId[] = ['wheat', 'carrot', 'tomato', 'pumpkin', 'egg', 'milk'];

export interface CropDef {
  id: CropId;
  /** Seed cost, paid when planting. */
  seed: number;
  /** Watered days needed before it is ripe. */
  days: number;
}

export const CROPS: Record<CropId, CropDef> = {
  wheat: { id: 'wheat', seed: 10, days: 3 },
  carrot: { id: 'carrot', seed: 20, days: 4 },
  tomato: { id: 'tomato', seed: 35, days: 5 },
  pumpkin: { id: 'pumpkin', seed: 60, days: 7 },
};

export const CROP_IDS: CropId[] = ['wheat', 'carrot', 'tomato', 'pumpkin'];

export interface AnimalDef {
  id: PenKind;
  name: string;
  emoji: string;
  cost: number;
  /** Days between one unit of produce and the next. */
  period: number;
  good: GoodId;
}

export const ANIMALS: Record<PenKind, AnimalDef> = {
  chicken: { id: 'chicken', name: 'Chickens', emoji: '🐔', cost: 150, period: 2, good: 'egg' },
  cow: { id: 'cow', name: 'Cow', emoji: '🐄', cost: 400, period: 3, good: 'milk' },
};

export const PEN_KINDS: PenKind[] = ['chicken', 'cow'];

/** dirt → tilled → crop → (dead when it dries out); pens sit on their own plot. */
export type PlotKind = 'dirt' | 'tilled' | 'crop' | 'dead' | 'pen';

/**
 * One of the 36 plots. Flat (rather than a union) so it stays trivially
 * JSON-able across the wire and cheap to copy in the daily simulation.
 */
export interface Plot {
  kind: PlotKind;
  /** Set while kind is 'crop' or 'dead' — what is (or was) growing here. */
  crop: CropId | null;
  /** Growth stages completed; ripe at CROPS[crop].days. */
  stage: number;
  /** Watered today — reset every night. */
  watered: boolean;
  /** Consecutive dry days: 1 = stalled, 2 = withering, 3 = dead. */
  dry: number;
  /** Set while kind is 'pen'. */
  animal: PenKind | null;
  /** Produce waiting to be collected (capped at PRODUCE_CAP). */
  produce: number;
  /** Days accumulated toward the next unit of produce. */
  cycle: number;
}

export function emptyPlot(): Plot {
  return {
    kind: 'dirt',
    crop: null,
    stage: 0,
    watered: false,
    dry: 0,
    animal: null,
    produce: 0,
    cycle: 0,
  };
}

export const isRipe = (p: Plot): boolean =>
  p.kind === 'crop' && p.crop !== null && p.stage >= CROPS[p.crop].days;

/** Growth left to run, 0..1 — drives the little bar under a growing crop. */
export function growth(p: Plot): number {
  if (p.crop === null) return 0;
  const days = CROPS[p.crop].days;
  return Math.max(0, Math.min(1, p.stage / days));
}

/** Sprout → leaf → bush → the crop itself. */
export function cropFace(p: Plot): string {
  if (p.crop === null) return '🌱';
  const def = CROPS[p.crop];
  if (p.stage >= def.days) return GOODS[p.crop].emoji;
  if (p.stage <= 0) return '🌱';
  return p.stage * 2 >= def.days ? '🪴' : '🌿';
}

export function emptyBarn(): Record<GoodId, number> {
  return { wheat: 0, carrot: 0, tomato: 0, pumpkin: 0, egg: 0, milk: 0 };
}

export function basePrices(): Record<GoodId, number> {
  return {
    wheat: GOODS.wheat.base,
    carrot: GOODS.carrot.base,
    tomato: GOODS.tomato.base,
    pumpkin: GOODS.pumpkin.base,
    egg: GOODS.egg.base,
    milk: GOODS.milk.base,
  };
}

/** Every good independently ±20% around its base, redrawn each night. */
export function rollPrices(random: () => number): Record<GoodId, number> {
  const roll = (base: number): number => Math.max(1, Math.round(base * (0.8 + random() * 0.4)));
  return {
    wheat: roll(GOODS.wheat.base),
    carrot: roll(GOODS.carrot.base),
    tomato: roll(GOODS.tomato.base),
    pumpkin: roll(GOODS.pumpkin.base),
    egg: roll(GOODS.egg.base),
    milk: roll(GOODS.milk.base),
  };
}

/** Wet spell every fifth night; otherwise rain is a bonus you can't plan on. */
export function rainChance(day: number): number {
  return day % 5 === 3 ? 0.55 : 0.2;
}

export function barnValue(
  barn: Record<GoodId, number>,
  prices: Record<GoodId, number>,
): number {
  let total = 0;
  for (const id of GOOD_IDS) total += barn[id] * prices[id];
  return total;
}

export const barnCount = (barn: Record<GoodId, number>): number =>
  GOOD_IDS.reduce((n, id) => n + barn[id], 0);

/** Clients are hostile: every id off the wire is checked against the tables. */
export function parseCrop(v: unknown): CropId | null {
  return typeof v === 'string' && CROP_IDS.includes(v as CropId) ? (v as CropId) : null;
}

export function parsePen(v: unknown): PenKind | null {
  return typeof v === 'string' && PEN_KINDS.includes(v as PenKind) ? (v as PenKind) : null;
}

export function parsePlotIndex(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < PLOTS ? v : null;
}
