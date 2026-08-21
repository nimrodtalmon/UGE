import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BsBoard, BsCell, Ship } from '../game.js';
import { SIZE, canPlace } from '../game.js';

const GLYPH: Record<BsCell, string> = {
  water: '',
  ship: '',
  hit: '💥',
  miss: '•',
  sunk: '🚢',
};

/** Grid padding in px — kept in sync with .bs-grid in style.css (drag maths). */
const PAD = 4;

const xOf = (cell: number): number => cell % SIZE;
const yOf = (cell: number): number => Math.floor(cell / SIZE);

export function BoardGrid(props: {
  board: BsBoard;
  /** Omit to render a display-only grid (own sea, or the table screen). */
  onFire?: (x: number, y: number) => void;
  disabled?: boolean;
  /** Cell index of the latest shot on THIS board, for the highlight. */
  last?: number | null;
  /** Size class: the phone's big board, the phone's corner board, the table's. */
  hero?: boolean;
  mini?: boolean;
  big?: boolean;
}) {
  const size = props.hero ? ' hero' : props.mini ? ' mini' : props.big ? ' big' : '';
  return (
    <div className={`bs-grid${size}`}>
      {props.board.cells.map((cell, i) => (
        <button
          key={i}
          className={`bs-cell ${cell}${i === props.last ? ' last' : ''}`}
          disabled={!props.onFire || props.disabled || cell !== 'water'}
          onClick={() => props.onFire?.(xOf(i), yOf(i))}
        >
          {/* the marker floats over a fixed square, so a shot never resizes a cell */}
          <span className="bs-mark">{GLYPH[cell]}</span>
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

/** The ships you still get to move, as tappable chips. */
export function FleetStrip(props: {
  fleet: Ship[];
  sel: number | null;
  onSel: (i: number | null) => void;
  locked: boolean;
}) {
  return (
    <div className="bs-strip">
      {props.fleet.map((s, i) => (
        <button
          key={s.name}
          className={i === props.sel ? 'bs-chip on' : 'bs-chip'}
          disabled={props.locked}
          onClick={() => props.onSel(props.sel === i ? null : i)}
        >
          <span className="bs-chip-name">{s.name}</span>
          <span className="bs-chip-bars">{'▮'.repeat(s.size)}</span>
        </button>
      ))}
    </div>
  );
}

/** The on-board cells a hull would cover, clipped to the board (for red ghosts). */
function ghostCells(x: number, y: number, size: number, horizontal: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i++) {
    const gx = horizontal ? x + i : x;
    const gy = horizontal ? y : y + i;
    if (gx >= 0 && gx < SIZE && gy >= 0 && gy < SIZE) out.push(gy * SIZE + gx);
  }
  return out;
}

/**
 * Your own sea during the place phase. Two ways to move a hull, both ending in
 * the same `onPlace` (the server validates again):
 *   • drag it — pointerdown on a hull, move, release;
 *   • tap it (here or in the fleet strip) to select, then tap a cell to drop
 *     its bow there; tapping the selected hull again rotates it.
 * A live ghost shows the landing spot, green when legal and red when not.
 */
export function PlaceBoard(props: {
  fleet: Ship[];
  sel: number | null;
  onSel: (i: number | null) => void;
  onPlace: (i: number, x: number, y: number, horizontal: boolean) => void;
  locked: boolean;
}) {
  const { fleet, sel, locked } = props;
  const gridRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ cells: number[]; ok: boolean } | null>(null);
  const drag = useRef<{ ship: number; offset: number; x: number; y: number; moved: boolean } | null>(null);
  const down = useRef<{ ship: number | null; wasSel: boolean }>({ ship: null, wasSel: false });
  const dragged = useRef(false);

  const shipAt = new Map<number, number>();
  fleet.forEach((s, i) => s.cells.forEach((c) => shipAt.set(c, i)));

  /** Board coordinates under the pointer, clamped to the grid. */
  const cellUnder = (cx: number, cy: number): { x: number; y: number } | null => {
    const el = gridRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const w = (r.width - PAD * 2) / SIZE;
    const h = (r.height - PAD * 2) / SIZE;
    if (w <= 0 || h <= 0) return null;
    const clamp = (v: number): number => Math.max(0, Math.min(SIZE - 1, v));
    return {
      x: clamp(Math.floor((cx - r.left - PAD) / w)),
      y: clamp(Math.floor((cy - r.top - PAD) / h)),
    };
  };

  const show = (i: number, x: number, y: number, horizontal: boolean): void => {
    const ship = fleet[i];
    if (!ship) return;
    setGhost({
      cells: ghostCells(x, y, ship.size, horizontal),
      ok: canPlace(fleet, i, x, y, horizontal) !== null,
    });
  };

  /** Place if legal; otherwise leave the red ghost up so the refusal is visible. */
  const tryPlace = (i: number, x: number, y: number, horizontal: boolean): void => {
    if (canPlace(fleet, i, x, y, horizontal)) {
      props.onPlace(i, x, y, horizontal);
      setGhost(null);
    } else {
      show(i, x, y, horizontal);
    }
  };

  const onDown = (i: number, e: ReactPointerEvent<HTMLButtonElement>): void => {
    if (locked) return;
    dragged.current = false;
    const ship = shipAt.get(i);
    down.current = { ship: ship ?? null, wasSel: ship !== undefined && ship === sel };
    if (ship !== undefined) {
      const s = fleet[ship]!;
      drag.current = { ship, offset: Math.max(0, s.cells.indexOf(i)), x: s.x, y: s.y, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      setGhost(null);
      if (sel !== ship) props.onSel(ship);
    } else if (sel !== null) {
      const s = fleet[sel]!;
      show(sel, xOf(i), yOf(i), s.horizontal); // press-and-hold preview on the tap path
    }
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (locked) return;
    const d = drag.current;
    const at = cellUnder(e.clientX, e.clientY);
    if (!at) return;
    if (d) {
      const s = fleet[d.ship];
      if (!s) return;
      const bx = s.horizontal ? at.x - d.offset : at.x;
      const by = s.horizontal ? at.y : at.y - d.offset;
      if (!d.moved && bx === d.x && by === d.y) return; // still sitting where it started
      d.moved = true;
      dragged.current = true;
      d.x = bx;
      d.y = by;
      show(d.ship, bx, by, s.horizontal);
    } else if (e.pointerType !== 'touch' && sel !== null) {
      const s = fleet[sel];
      if (s) show(sel, at.x, at.y, s.horizontal); // mouse hover preview
    }
  };

  const onUp = (): void => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    const s = fleet[d.ship];
    if (s) tryPlace(d.ship, d.x, d.y, s.horizontal);
  };

  const onTap = (i: number): void => {
    if (locked) return;
    if (dragged.current) {
      dragged.current = false; // that click was the end of a drag
      return;
    }
    const ship = shipAt.get(i);
    const x = xOf(i);
    const y = yOf(i);
    if (sel !== null) {
      const s = fleet[sel]!;
      if (ship === sel) {
        // tapping the hull that was ALREADY selected flips it; the tap that
        // selected it in the first place does nothing else
        if (down.current.wasSel) tryPlace(sel, s.x, s.y, !s.horizontal);
        return;
      }
      if (ship === undefined) {
        tryPlace(sel, x, y, s.horizontal);
        return;
      }
    }
    if (ship !== undefined) {
      props.onSel(ship);
      setGhost(null);
    }
  };

  return (
    <div
      className="bs-grid hero place"
      ref={gridRef}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onPointerLeave={(e) => {
        // a touch "leaves" on release — only a mouse leaving clears the ghost
        if (e.pointerType !== 'touch' && !drag.current) setGhost(null);
      }}
    >
      {Array.from({ length: SIZE * SIZE }, (_, i) => {
        const ship = shipAt.get(i);
        const g = ghost && ghost.cells.includes(i) ? (ghost.ok ? ' ghost ok' : ' ghost bad') : '';
        const on = ship !== undefined && ship === sel ? ' sel' : '';
        return (
          <button
            key={i}
            className={`bs-cell ${ship === undefined ? 'water' : 'ship'}${on}${g}`}
            disabled={locked}
            onPointerDown={(e) => onDown(i, e)}
            onClick={() => onTap(i)}
          >
            <span className="bs-mark" />
          </button>
        );
      })}
    </div>
  );
}

/** Exported for the hand view's rotate button — same rules as a tap-rotate. */
export const canRotate = (fleet: Ship[], i: number | null): boolean =>
  i !== null && fleet[i] !== undefined && canPlace(fleet, i, fleet[i]!.x, fleet[i]!.y, !fleet[i]!.horizontal) !== null;
