import type { CSSProperties } from 'react';
import { ICON, PLANT_SUPPLY } from '../lib.js';
import type { CityView } from '../lib.js';

/** "$1,240" / "−$80" — the minus is a real minus so columns don't jitter. */
export function money(n: number): string {
  const digits = Math.abs(n).toLocaleString('en-US');
  return `${n < 0 ? '−' : ''}$${digits}`;
}

export const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/**
 * Money · people · happiness · year. Every cell is a fixed box and the
 * happiness bar lives inside one, so nothing here can ever shove the grid
 * down under a thumb that is already reaching for a tile.
 */
export function Stats({ view, big }: { view: CityView; big?: boolean }) {
  const years = view.sandbox ? '' : `/${view.years}`;
  return (
    <div className={big ? 'ct-stats ct-big' : 'ct-stats'}>
      <div className="ct-stat">
        <span className="ct-stat-label">treasury</span>
        <span className={view.money < 0 ? 'ct-stat-value ct-bad' : 'ct-stat-value'}>
          {money(view.money)}
        </span>
      </div>
      <div className="ct-stat">
        <span className="ct-stat-label">people</span>
        <span className="ct-stat-value">{view.population.toLocaleString('en-US')}</span>
      </div>
      <div className="ct-stat">
        <span className="ct-stat-label">happy</span>
        <span className="ct-stat-value">{view.happiness}</span>
        <div className="ct-bar">
          <div
            className={view.happiness < 30 ? 'ct-bar-fill ct-low' : 'ct-bar-fill'}
            style={{ width: `${view.happiness}%` }}
          />
        </div>
      </div>
      <div className="ct-stat">
        <span className="ct-stat-label">year</span>
        <span className="ct-stat-value">
          {view.year}
          {years}
        </span>
      </div>
    </div>
  );
}

/** One reserved line of city plumbing: room, work, power, and the year's books. */
export function Meters({ view }: { view: CityView }) {
  const s = view.stats;
  const goal = view.sandbox ? null : `🎯 ${view.goal}`;
  return (
    <p className="ct-meters">
      <span title="housing">🏠 {s.housing}</span>
      <span title="jobs">💼 {s.jobs}</span>
      <span title="power used / supplied" className={s.unpowered > 0 ? 'ct-bad' : undefined}>
        ⚡ {s.powerUse}/{s.powerCap}
      </span>
      <span title="taxes minus upkeep" className={view.books.net < 0 ? 'ct-bad' : undefined}>
        💰 {signed(view.books.net)}
      </span>
      {goal !== null && <span title="target population">{goal}</span>}
    </p>
  );
}

/**
 * The map. Omit `onTap` for a display-only board (the table screen).
 * Tiles carry a ⚠ when they are cut off or dark, and a level pip once a
 * block has grown past the sprawl.
 */
export function Grid(props: {
  view: CityView;
  big?: boolean;
  onTap?: (x: number, y: number) => void;
}) {
  const { view } = props;
  const live = !!props.onTap && view.status === 'playing';
  return (
    <div className={props.big ? 'ct-map ct-big' : 'ct-map'}>
      <div className="ct-grid" style={{ '--ct-w': view.w, '--ct-h': view.h } as CSSProperties}>
        {view.tiles.map((kind, i) => {
          const x = i % view.w;
          const y = Math.floor(i / view.w);
          const level = view.level[i] ?? 0;
          const warn = view.warn[i] === true;
          return (
            <button
              key={i}
              className={`ct-tile ct-k-${kind}`}
              disabled={!live}
              aria-label={`${x + 1}, ${y + 1}: ${kind}`}
              onClick={live ? () => props.onTap?.(x, y) : undefined}
            >
              <span className="ct-emoji">{ICON[kind]}</span>
              {warn && <span className="ct-warn">⚠</span>}
              {!warn && level >= 2 && <span className="ct-level">{level}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The last few years, newest first. Height is reserved for the full list. */
export function Log({ view, big }: { view: CityView; big?: boolean }) {
  return (
    <ul className={big ? 'ct-log ct-big' : 'ct-log'}>
      {view.log.map((line, i) => (
        <li key={`${view.year}-${i}`} className={i === 0 ? 'ct-log-line ct-fresh' : 'ct-log-line'}>
          {line}
        </li>
      ))}
    </ul>
  );
}

/** One line of advice about whatever is most wrong with the city right now. */
export function adviceFor(view: CityView): string {
  const s = view.stats;
  if (s.counts.house === 0) return `zone some homes — ${ICON.house} needs a road and power`;
  if (s.powerCap === 0) {
    return `nothing has power — one ${ICON.plant} plant runs ${PLANT_SUPPLY} buildings`;
  }
  if (s.unconnected > 0) return `${s.unconnected} cut off — every block needs to touch a road`;
  if (s.unpowered > 0) return `${s.unpowered} in the dark — build another ${ICON.plant} plant`;
  if (s.jobs < s.housing) return 'more homes than jobs — add shops and factories';
  if (s.housing < s.jobs) return 'more jobs than homes — zone more houses';
  if (view.happiness < 30) return 'nobody is moving in — parks help, factories do not';
  return 'blocks packed side by side grow taller — and hold far more people';
}
