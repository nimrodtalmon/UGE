import type { CSSProperties, ReactNode } from 'react';
import {
  ANIMALS,
  CROPS,
  CROP_IDS,
  FIELD,
  GOODS,
  GOOD_IDS,
  PEN_KINDS,
  cropFace,
  growth,
  isRipe,
} from '../lib.js';
import type { CropId, GoodId, PenKind, Plot } from '../lib.js';
import type { FarmLog, FarmView } from '../game.js';

/** One entry in the phone's tool palette; the table never renders these. */
export interface Tool {
  key: string;
  icon: string;
  /** Second line on the chip — a cost, or the chore's name. */
  label: string;
  /** Money it costs to use (seeds, pens). */
  cost: number;
  /** Energy it costs (purchases cost none). */
  energy: number;
  crop: CropId | null;
  animal: PenKind | null;
}

const chore = (key: string, icon: string, label: string): Tool => ({
  key,
  icon,
  label,
  cost: 0,
  energy: 1,
  crop: null,
  animal: null,
});

export const TOOLS: Tool[] = [
  chore('till', '🪓', 'till'),
  ...CROP_IDS.map((id) => ({
    key: `seed:${id}`,
    icon: GOODS[id].emoji,
    label: `$${CROPS[id].seed}`,
    cost: CROPS[id].seed,
    energy: 1,
    crop: id,
    animal: null,
  })),
  chore('water', '💧', 'water'),
  chore('gather', '✋', 'gather'),
  ...PEN_KINDS.map((id) => ({
    key: `pen:${id}`,
    icon: `🏠${ANIMALS[id].emoji}`,
    label: `$${ANIMALS[id].cost}`,
    cost: ANIMALS[id].cost,
    energy: 0,
    crop: null,
    animal: id,
  })),
];

/** Whether the selected tool would do anything on this plot. */
export function canApply(tool: Tool, plot: Plot): boolean {
  if (tool.animal !== null) return plot.kind === 'dirt';
  if (tool.crop !== null) return plot.kind === 'tilled';
  if (tool.key === 'till') return plot.kind === 'dirt' || plot.kind === 'dead';
  if (tool.key === 'water') return plot.kind === 'crop' && !plot.watered;
  if (tool.key === 'gather') return isRipe(plot) || (plot.kind === 'pen' && plot.produce > 0);
  return false;
}

/** Enough money and enough energy left today. */
export const canAfford = (tool: Tool, view: FarmView): boolean =>
  view.money >= tool.cost && view.energy >= tool.energy;

interface Face {
  emoji: string;
  badge: string | null;
  badgeKind: string;
  /** 0..1 growth bar, or null when the plot grows nothing. */
  bar: number | null;
  label: string;
}

function faceOf(plot: Plot): Face {
  if (plot.kind === 'pen' && plot.animal !== null) {
    const def = ANIMALS[plot.animal];
    const ready = plot.produce > 0;
    return {
      emoji: def.emoji,
      badge: ready ? `${GOODS[def.good].emoji}${plot.produce}` : null,
      badgeKind: 'ready',
      bar: null,
      label: `${def.name} pen${ready ? `, ${plot.produce} ready` : ''}`,
    };
  }
  if (plot.kind === 'dead') {
    return { emoji: '💀', badge: null, badgeKind: '', bar: null, label: 'dead plant — till it' };
  }
  if (plot.kind === 'crop' && plot.crop !== null) {
    const ripe = isRipe(plot);
    const badge = plot.watered ? '💧' : plot.dry > 0 ? '⚠' : null;
    return {
      emoji: cropFace(plot),
      badge,
      badgeKind: plot.watered ? 'wet' : 'dry',
      bar: ripe ? null : growth(plot),
      label: `${GOODS[plot.crop].name}${ripe ? ', ripe' : ''}`,
    };
  }
  return {
    emoji: '',
    badge: null,
    badgeKind: '',
    bar: null,
    label: plot.kind === 'tilled' ? 'tilled bed' : 'dirt',
  };
}

/**
 * The 6×6 field. Omit onTap for the display-only table screen; `tool`, when
 * given, rings the plots that tool would actually work on.
 */
export function Field(props: {
  view: FarmView;
  big?: boolean;
  tool?: Tool | null;
  onTap?: (i: number) => void;
}) {
  const live = !!props.onTap;
  return (
    <div className={props.big ? 'fa-field big' : 'fa-field'}>
      <div className="fa-grid" style={{ '--fa-cols': FIELD } as CSSProperties}>
        {props.view.plots.map((plot, i) => {
          const face = faceOf(plot);
          const classes = ['fa-plot', `fa-${plot.kind}`];
          if (isRipe(plot)) classes.push('fa-ripe');
          if (plot.kind === 'pen' && plot.produce > 0) classes.push('fa-full');
          if (plot.kind === 'crop' && plot.dry >= 2) classes.push('fa-wilting');
          if (live && props.tool && canApply(props.tool, plot)) classes.push('fa-target');
          return (
            <button
              key={i}
              className={classes.join(' ')}
              disabled={!live}
              aria-label={`plot ${i + 1}: ${face.label}`}
              onClick={() => props.onTap?.(i)}
            >
              <span className="fa-face">{face.emoji}</span>
              {face.badge !== null && (
                <span className={`fa-badge fa-${face.badgeKind}`}>{face.badge}</span>
              )}
              {face.bar !== null && (
                <span className="fa-bar">
                  <span className="fa-bar-fill" style={{ width: `${Math.round(face.bar * 100)}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** ●●●●○○ — one pip per point of the day's energy. */
export function Pips(props: { energy: number; max: number }) {
  const full = Math.max(0, Math.min(props.max, props.energy));
  return (
    <span className="fa-pips" aria-label={`${props.energy} of ${props.max} energy`}>
      {'●'.repeat(full)}
      <span className="fa-pips-out">{'○'.repeat(Math.max(0, props.max - full))}</span>
    </span>
  );
}

/** Money · day · energy. Every readout has a reserved width so nothing jumps. */
export function Stats(props: { view: FarmView; children?: ReactNode }) {
  const { view } = props;
  const day =
    view.daysLeft === null ? `day ${view.day}` : `day ${view.day}/${view.limit ?? view.day}`;
  return (
    <div className="fa-stats">
      <span className="fa-stat fa-cash">${view.money}</span>
      <span className="fa-stat">
        {view.rainToday ? '🌧' : '☀️'} {day}
      </span>
      <span className="fa-stat fa-energy">
        <Pips energy={view.energy} max={view.maxEnergy} />
      </span>
      {props.children}
    </div>
  );
}

/** Today's market. ▲ / ▼ mark a good trading off its base price. */
export function Market(props: { view: FarmView; big?: boolean }) {
  return (
    <div className={props.big ? 'fa-market big' : 'fa-market'}>
      {GOOD_IDS.map((id: GoodId) => {
        const price = props.view.prices[id];
        const base = GOODS[id].base;
        const dir = price > base * 1.05 ? 'up' : price < base * 0.95 ? 'down' : 'flat';
        return (
          <span key={id} className={`fa-price fa-${dir}`} title={GOODS[id].name}>
            {GOODS[id].emoji}
            {price}
            <span className="fa-arrow">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·'}</span>
          </span>
        );
      })}
    </div>
  );
}

/** The day log, newest first, with the height of `lines` always reserved. */
export function DayLog(props: { log: FarmLog[]; lines: number }) {
  const rows: (FarmLog | null)[] = [];
  for (let i = 0; i < props.lines; i++) rows.push(props.log[i] ?? null);
  return (
    <div className="fa-log" style={{ '--fa-lines': props.lines } as CSSProperties}>
      {rows.map((entry, i) => (
        <div key={i} className={entry ? 'fa-log-row' : 'fa-log-row fa-empty'}>
          {entry ? (
            <>
              <span className="fa-log-day">d{entry.day}</span>
              <span className="fa-log-text">{entry.text}</span>
            </>
          ) : (
            <span className="fa-log-text">&nbsp;</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** What the barn is holding, as counted emoji. */
export function Barn(props: { view: FarmView }) {
  const held = GOOD_IDS.filter((id) => props.view.barn[id] > 0);
  return (
    <div className="fa-barn">
      {held.length === 0 ? (
        <span className="fa-barn-empty">barn empty</span>
      ) : (
        held.map((id) => (
          <span key={id} className="fa-barn-item">
            {GOODS[id].emoji}
            {props.view.barn[id]}
          </span>
        ))
      )}
    </div>
  );
}
