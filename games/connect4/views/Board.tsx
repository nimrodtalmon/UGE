import type { C4View } from '../game.js';

/**
 * Shared board renderer. Omit `onDrop` for the display-only table; the tap
 * layer is a full-height button per column, sitting over the whole grid, so
 * tapping the grid itself drops into that column too.
 */
export function Board(props: {
  view: C4View;
  big?: boolean;
  ghost?: number | null;
  ghostSeat?: number;
  onHover?: (col: number | null) => void;
  onDrop?: (col: number) => void;
}) {
  const { view } = props;
  const cols = view.cols;
  const columns = Array.from({ length: cols }, (_, x) => x);
  return (
    <div className={props.big ? 'c4-boardwrap big' : 'c4-boardwrap'}>
      {/* always here, disc or no disc: a lane that appeared on touch would
          shove the board down under the finger already aiming at it */}
      <div className="c4-ghostlane">
        {columns.map((x) => (
          <div className="c4-ghostcell" key={x}>
            {props.ghost === x && <span className={`c4-ghost s${props.ghostSeat ?? 0}`} />}
          </div>
        ))}
      </div>
      <div className="c4-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {view.board.map((seat, i) => {
          const classes = ['c4-hole'];
          if (seat >= 0) classes.push(`s${seat}`);
          if (view.win?.includes(i)) classes.push('win');
          else if (view.last === i) classes.push('drop');
          return (
            <div className="c4-cell" key={i}>
              <span className={classes.join(' ')} />
            </div>
          );
        })}
        {props.onDrop && (
          <div className="c4-taps" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {columns.map((x) => {
              const open = view.open.includes(x);
              return (
                <button
                  key={x}
                  className="c4-tap"
                  disabled={!open}
                  aria-label={`drop in column ${x + 1}`}
                  onPointerDown={() => props.onHover?.(x)}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && props.onHover?.(x)}
                  onPointerLeave={() => props.onHover?.(null)}
                  onClick={() => {
                    props.onDrop?.(x);
                    props.onHover?.(null);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** ⚪/⚫-style legend: who is which disc, and whose turn it is. */
export function Legend({ view, names }: { view: C4View; names: [string, string] }) {
  return (
    <p className="c4-legend">
      {[0, 1].map((seat) => (
        <span key={seat} className={view.current === seat && !view.win && !view.draw ? 'c4-side on' : 'c4-side'}>
          <span className={`c4-chip s${seat}`} />
          {names[seat === 0 ? 0 : 1]}
        </span>
      ))}
    </p>
  );
}
