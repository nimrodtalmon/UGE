import type { BsBoard, BsCell } from '../game.js';
import { SIZE } from '../game.js';

const GLYPH: Record<BsCell, string> = {
  water: '',
  ship: '',
  hit: '💥',
  miss: '•',
  sunk: '🚢',
};

export function BoardGrid(props: {
  board: BsBoard;
  /** Omit to render a display-only grid (own sea, or the table screen). */
  onFire?: (x: number, y: number) => void;
  disabled?: boolean;
  /** Cell index of the latest shot on THIS board, for the highlight. */
  last?: number | null;
  big?: boolean;
}) {
  const { board } = props;
  return (
    <div className={props.big ? 'bs-grid big' : 'bs-grid'}>
      {board.cells.map((cell, i) => (
        <button
          key={i}
          className={`bs-cell ${cell}${i === props.last ? ' last' : ''}`}
          disabled={!props.onFire || props.disabled || cell !== 'water'}
          onClick={() => props.onFire?.(i % SIZE, Math.floor(i / SIZE))}
        >
          {GLYPH[cell]}
        </button>
      ))}
    </div>
  );
}

export function FleetTicker(props: { board: BsBoard }) {
  return (
    <div className="bs-fleet">
      {props.board.ships.map((s) => (
        <span key={s.name} className={s.sunk ? 'bs-ship-tag sunk' : 'bs-ship-tag'}>
          {s.name} {'▮'.repeat(s.size)}
        </span>
      ))}
    </div>
  );
}
