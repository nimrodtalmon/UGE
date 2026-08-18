import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { LightsOutState } from '../game.js';

/** Shared board renderer for both the table and hand views. */
export function Board({ view, over, move }: GameViewProps<LightsOutState>) {
  return (
    <div
      className="lo-grid"
      style={{ gridTemplateColumns: `repeat(${view.size}, 1fr)` }}
    >
      {view.grid.map((on, i) => (
        <button
          key={i}
          className={on ? 'lo-cell on' : 'lo-cell'}
          disabled={!!over}
          onClick={() => move('press', i)}
          aria-label={`cell ${i}`}
        />
      ))}
    </div>
  );
}

export function Status({ view, over }: Pick<GameViewProps<LightsOutState>, 'view' | 'over'>) {
  return (
    <p className="lo-status">
      {over ? <strong>🎉 {over.text}</strong> : `${view.moves} moves`}
    </p>
  );
}
