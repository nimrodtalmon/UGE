import type { CSSProperties } from 'react';
import type { DbView } from '../game.js';
import { edgeCount, edgeSpot } from '../rules.js';

/** First letter of a name, for the box the player just closed. */
export const initialOf = (name: string): string => (name.trim()[0] ?? '?').toUpperCase();

/**
 * The board: dots on a fixed lattice, lines between them, boxes behind.
 * One CSS grid of 2n-1 tracks each way — dots on the odd tracks, lines and
 * boxes on the even ones — so nothing ever reflows as lines are drawn.
 * Omit `onDraw` for a display-only board (the table screen).
 */
export function Board(props: {
  view: DbView;
  names: [string, string];
  big?: boolean;
  onDraw?: (edge: number) => void;
}) {
  const { view, names } = props;
  const n = view.n;
  // the dot tracks are fixed, the box tracks share what is left: the lattice
  // is the same size whatever gets drawn on it
  const frame = { '--db-n': n } as CSSProperties;
  const grid = {
    gridTemplateColumns: `var(--db-dot) repeat(${n - 1}, 1fr var(--db-dot))`,
    gridTemplateRows: `var(--db-dot) repeat(${n - 1}, 1fr var(--db-dot))`,
  } as CSSProperties;

  const dots = Array.from({ length: n * n }, (_, k) => {
    const r = Math.floor(k / n);
    const c = k % n;
    return (
      <i
        key={`d${k}`}
        className="db-dot"
        style={{ gridRow: 2 * r + 1, gridColumn: 2 * c + 1 }}
      />
    );
  });

  const boxes = Array.from({ length: (n - 1) * (n - 1) }, (_, b) => {
    const r = Math.floor(b / (n - 1));
    const c = b % (n - 1);
    const seat = view.boxes[b] ?? -1;
    const classes = ['db-box'];
    if (seat >= 0) classes.push(seat === 0 ? 'db-s0' : 'db-s1');
    if (view.justClosed.includes(b)) classes.push('db-fresh');
    return (
      <div
        key={`b${b}`}
        className={classes.join(' ')}
        style={{ gridRow: 2 * r + 2, gridColumn: 2 * c + 2 }}
      >
        {seat >= 0 ? initialOf(names[seat === 0 ? 0 : 1]) : ''}
      </div>
    );
  });

  const lines = Array.from({ length: edgeCount(n) }, (_, e) => {
    const spot = edgeSpot(n, e);
    const seat = view.drawnBy[e] ?? -1;
    const drawn = view.taken[e] === true;
    const live = !drawn && !!props.onDraw;
    const classes = ['db-edge', spot.horizontal ? 'db-h' : 'db-v'];
    if (drawn) classes.push('db-on', seat === 0 ? 'db-s0' : 'db-s1');
    if (live) classes.push('db-live');
    if (view.last === e) classes.push('db-latest');
    const row = spot.horizontal ? 2 * spot.row + 1 : 2 * spot.row + 2;
    const col = spot.horizontal ? 2 * spot.col + 2 : 2 * spot.col + 1;
    return (
      <button
        key={`e${e}`}
        className={classes.join(' ')}
        style={{ gridRow: row, gridColumn: col }}
        disabled={!live}
        aria-label={`${spot.horizontal ? 'horizontal' : 'vertical'} line ${spot.row + 1}-${spot.col + 1}`}
        onClick={() => props.onDraw?.(e)}
      >
        <span className="db-bar" />
      </button>
    );
  });

  return (
    <div className={props.big ? 'db-board big' : 'db-board'} style={frame}>
      <div className="db-grid" style={grid}>
        {boxes}
        {lines}
        {dots}
      </div>
    </div>
  );
}

/** Live score, with the side to move lit up. */
export function Score(props: { view: DbView; names: [string, string]; over: boolean }) {
  const { view, names } = props;
  const left = view.boxes.filter((b) => b < 0).length;
  return (
    <p className="db-score">
      {[0, 1].map((seat) => (
        <span
          key={seat}
          className={`db-side db-s${seat}${!props.over && view.turn === seat ? ' db-on' : ''}`}
        >
          <span className="db-mark">{initialOf(names[seat === 0 ? 0 : 1])}</span>
          <strong>{view.scores[seat === 0 ? 0 : 1]}</strong>
          <span className="db-who">{names[seat === 0 ? 0 : 1]}</span>
        </span>
      ))}
      <span className="db-left">{left} left</span>
    </p>
  );
}
