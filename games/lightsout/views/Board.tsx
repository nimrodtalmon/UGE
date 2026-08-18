import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { LightsOutState } from '../game.js';

/** Shared board renderer; omit onPress for the display-only table. */
export function Board({
  view,
  over,
  onPress,
}: Pick<GameViewProps<LightsOutState>, 'view' | 'over'> & { onPress?: (i: number) => void }) {
  return (
    <div
      className="lo-grid"
      style={{ gridTemplateColumns: `repeat(${view.size}, 1fr)` }}
    >
      {view.grid.map((on, i) => (
        <button
          key={i}
          className={on ? 'lo-cell on' : 'lo-cell'}
          disabled={!!over || !onPress}
          onClick={() => onPress?.(i)}
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
