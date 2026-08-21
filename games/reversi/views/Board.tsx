import type { RvView } from '../game.js';

/**
 * Shared board renderer. Omit `onPlace` for the display-only table. Discs are
 * two-faced and flip with a CSS transition, so an outflanked line turns over
 * rather than blinking to the other colour.
 */
export function Board(props: {
  view: RvView;
  big?: boolean;
  /** Show the legal-move dots (always on: they are what makes the game playable). */
  dots?: boolean;
  onPlace?: (x: number, y: number) => void;
}) {
  const { view } = props;
  return (
    <div
      className={props.big ? 'rv-grid big' : 'rv-grid'}
      style={{ gridTemplateColumns: `repeat(${view.size}, 1fr)` }}
    >
      {view.board.map((seat, i) => {
        const x = i % view.size;
        const y = Math.floor(i / view.size);
        const legal = props.dots !== false && view.legal.includes(i);
        const classes = ['rv-sq'];
        if (legal) classes.push('legal');
        if (view.last === i) classes.push('last');
        return (
          <button
            key={i}
            className={classes.join(' ')}
            disabled={!props.onPlace || !legal}
            aria-label={`square ${'abcdefgh'[x] ?? x}${y + 1}`}
            onClick={() => props.onPlace?.(x, y)}
          >
            {seat >= 0 ? (
              <span
                className={`rv-disc ${seat === 1 ? 'w' : 'b'}${view.flipped.includes(i) ? ' just' : ''}`}
              >
                <span className="rv-face b" />
                <span className="rv-face w" />
              </span>
            ) : (
              legal && <span className="rv-dot" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Live disc count, with the side to move lit up. */
export function Score({ view, names, over }: { view: RvView; names: [string, string]; over: boolean }) {
  return (
    <p className="rv-score">
      {[0, 1].map((seat) => (
        <span key={seat} className={!over && view.current === seat ? 'rv-side on' : 'rv-side'}>
          <span className={seat === 0 ? 'rv-chip b' : 'rv-chip w'} />
          <strong>{view.scores[seat === 0 ? 0 : 1]}</strong>
          <span className="rv-who">{names[seat === 0 ? 0 : 1]}</span>
        </span>
      ))}
    </p>
  );
}
