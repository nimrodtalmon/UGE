import { SIZE } from '../game.js';
import type { Slide2048View } from '../game.js';

/** Colour ramp: pale → orange → red → gold → purple as the numbers climb. */
function tierOf(value: number): string {
  if (value >= 1024) return 'purple';
  if (value >= 128) return 'gold';
  if (value >= 32) return 'red';
  if (value >= 8) return 'orange';
  return 'pale';
}

/**
 * The board. Rendered identically on phone and table — the table just passes
 * `big` and hangs no handlers on it.
 */
export function Board({ view, big }: { view: Slide2048View; big?: boolean }) {
  const fresh = new Set(view.fresh);
  return (
    <div
      className={big ? 'sl-board sl-big' : 'sl-board'}
      style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}
    >
      {view.grid.map((value, i) => {
        if (value === 0) return <div key={`e${i}`} className="sl-cell" />;
        const pop = fresh.has(i);
        // a fresh cell's key carries the generation, so React remounts it and
        // the pop animation replays; settled tiles keep their key and stay put
        return (
          <div
            key={pop ? `${i}:${value}:${view.gen}` : `${i}:${value}`}
            className={[
              'sl-cell',
              'sl-tile',
              `sl-${tierOf(value)}`,
              `sl-d${String(value).length}`,
              pop && 'sl-pop',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {value}
          </div>
        );
      })}
    </div>
  );
}

export function Stats({ view }: { view: Slide2048View }) {
  return (
    <div className="sl-stats">
      <div className="sl-stat">
        <span className="sl-stat-label">score</span>
        <strong className="sl-stat-value">{view.score}</strong>
      </div>
      <div className="sl-stat">
        <span className="sl-stat-label">best tile</span>
        <strong className="sl-stat-value">{view.best}</strong>
      </div>
      <div className="sl-stat">
        <span className="sl-stat-label">moves</span>
        <strong className="sl-stat-value">{view.moves}</strong>
      </div>
    </div>
  );
}

/** One reserved line: win banner, game-over text, or nothing. */
export function Banner({ view, over }: { view: Slide2048View; over: { text: string } | null }) {
  return (
    <p className="sl-banner">
      {over ? (
        <strong>{over.text}</strong>
      ) : view.won ? (
        <strong className="sl-won">🏆 2048! keep going…</strong>
      ) : (
        ' '
      )}
    </p>
  );
}
