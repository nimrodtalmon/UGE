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

const xOf = (cell: number): number => cell % SIZE;
const yOf = (cell: number): number => Math.floor(cell / SIZE);

/**
 * Every cell is a fixed square: the size lives in CSS (--bs-cell) and the
 * glyph rides in an absolutely positioned child, so no marker, preview or
 * highlight can change the box. State classes are bs- prefixed on purpose —
 * a bare `ghost` on a <button> is a platform utility class (button.ghost)
 * that would win on specificity and put padding back on the cell.
 */
function Cell(props: {
  cell: BsCell;
  extra?: string;
  disabled?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`bs-cell ${props.cell}${props.extra ?? ''}`}
      disabled={props.disabled}
      onClick={props.onClick}
      onPointerDown={props.onPointerDown}
    >
      <span className="bs-mark">{GLYPH[props.cell]}</span>
    </button>
  );
}

export function BoardGrid(props: {
  board: BsBoard;
  /** Omit to render a display-only grid (own sea, or the table screen). */
  onFire?: (x: number, y: number) => void;
  disabled?: boolean;
  /** Cell index of the latest shot on THIS board, for the highlight. */
  last?: number | null;
  /** Size class: the phone's board, or the table's pair. */
  hero?: boolean;
  big?: boolean;
}) {
  const size = props.hero ? ' hero' : props.big ? ' big' : '';
  return (
    <div className={`bs-grid${size}`}>
      {props.board.cells.map((cell, i) => (
        <Cell
          key={i}
          cell={cell}
          extra={i === props.last ? ' bs-last' : ''}
          disabled={!props.onFire || props.disabled || cell !== 'water'}
          onClick={() => props.onFire?.(xOf(i), yOf(i))}
        />
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

/** How a hull that is still in the tray would lie: the shared rotate toggle. */
const layOf = (ship: Ship, horiz: boolean): boolean => (ship.placed ? ship.horizontal : horiz);

/**
 * The place phase: a tray of the hulls still to go out, and your own sea.
 * Both live in one component because a drag runs across them — the pointer is
 * captured here once a drag starts, so picking a ship up from the tray and
 * dropping it on the water is one gesture.
 *
 * Three ways to place, all ending in the same `onPlace` (the server validates
 * again):
 *   • drag a tray chip onto the sea;
 *   • drag a hull already on the water to move it;
 *   • tap a ship (tray or board) to select it, then tap the square its bow
 *     goes on — the accessible path, no dragging needed. Tapping a selected
 *     hull on the board rotates it.
 * A live ghost shows the landing spot, green when it fits and red when not.
 */
export function PlaceArea(props: {
  fleet: Ship[];
  sel: number | null;
  onSel: (i: number | null) => void;
  /** Orientation for hulls still in the tray (the Rotate button flips it). */
  horiz: boolean;
  /** Tapping the hull that is already in hand turns it — same as on the board. */
  onRotate: () => void;
  onPlace: (i: number, x: number, y: number, horizontal: boolean) => void;
  locked: boolean;
}) {
  const { fleet, sel, horiz, locked } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ cells: number[]; ok: boolean } | null>(null);
  const drag = useRef<{
    ship: number;
    offset: number;
    at: { x: number; y: number } | null;
    moved: boolean;
    captured: boolean;
  } | null>(null);
  const down = useRef<{ ship: number | null; wasSel: boolean }>({ ship: null, wasSel: false });
  const dragged = useRef(false);
  /** The hull currently in the air. It leaves its old squares while dragged,
   *  so the ship really moves with the finger instead of staying put behind a
   *  green preview of itself. */
  const [lifted, setLifted] = useState<number | null>(null);

  const shipAt = new Map<number, number>();
  fleet.forEach((s, i) => {
    if (i === lifted) return; // in the air — its old squares are open water
    s.cells.forEach((c) => shipAt.set(c, i));
  });

  /**
   * Board coordinates under the pointer, or null when it is well off the
   * board. Measured from the first cell's own box, so gaps, padding and
   * borders never have to be mirrored here.
   */
  const cellUnder = (cx: number, cy: number): { x: number; y: number } | null => {
    const first = gridRef.current?.firstElementChild;
    if (!first) return null;
    const r = first.getBoundingClientRect();
    const last = gridRef.current!.lastElementChild!.getBoundingClientRect();
    const pitch = (last.left - r.left) / (SIZE - 1);
    if (!(pitch > 0)) return null;
    const fx = (cx - r.left) / pitch;
    const fy = (cy - r.top) / pitch;
    if (fx < -1 || fy < -1 || fx > SIZE + 1 || fy > SIZE + 1) return null; // a cell of slack, then give up
    const clamp = (v: number): number => Math.max(0, Math.min(SIZE - 1, Math.floor(v)));
    return { x: clamp(fx), y: clamp(fy) };
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
      setLifted(null);
    } else {
      show(i, x, y, horizontal);
    }
  };

  /**
   * Arm a drag of hull #i; `offset` is which of its cells sits under the
   * finger. The pointer is NOT captured yet: capturing on pointerdown
   * retargets the follow-up click to the capture element, which would kill
   * every tap. It is taken on the first real move instead (see onMove), by
   * which time the click is being suppressed anyway.
   */
  const grab = (i: number, offset: number): void => {
    if (locked) return;
    dragged.current = false;
    drag.current = { ship: i, offset, at: null, moved: false, captured: false };
    setGhost(null);
    if (sel !== i) props.onSel(i);
  };

  const onTrayDown = (i: number): void => {
    down.current = { ship: i, wasSel: i === sel };
    grab(i, 0); // the bow follows the finger
  };

  const onCellDown = (i: number): void => {
    if (locked) return;
    dragged.current = false;
    const ship = shipAt.get(i);
    down.current = { ship: ship ?? null, wasSel: ship !== undefined && ship === sel };
    if (ship !== undefined) {
      grab(ship, Math.max(0, fleet[ship]!.cells.indexOf(i)));
    } else if (sel !== null) {
      const s = fleet[sel]!;
      show(sel, xOf(i), yOf(i), layOf(s, horiz)); // press-and-hold preview on the tap path
    }
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (locked) return;
    const d = drag.current;
    const at = cellUnder(e.clientX, e.clientY);
    if (d) {
      const s = fleet[d.ship];
      if (!s) return;
      const lay = layOf(s, horiz);
      if (!at) {
        d.at = null; // dragged away from the board — nothing to drop on
        setGhost(null);
        return;
      }
      const bx = lay ? at.x - d.offset : at.x;
      const by = lay ? at.y : at.y - d.offset;
      if (!d.moved && s.placed && bx === s.x && by === s.y) return; // still sitting where it started
      d.moved = true;
      dragged.current = true;
      setLifted(d.ship);
      if (!d.captured) {
        // now it is unmistakably a drag: hold the pointer so a release outside
        // the board still comes back here
        d.captured = true;
        wrapRef.current?.setPointerCapture(e.pointerId);
      }
      d.at = { x: bx, y: by };
      show(d.ship, bx, by, lay);
    } else if (e.pointerType !== 'touch' && sel !== null && at) {
      const s = fleet[sel];
      if (s) show(sel, at.x, at.y, layOf(s, horiz)); // mouse hover preview
    }
  };

  const onUp = (): void => {
    const d = drag.current;
    drag.current = null;
    // Whatever happens next, the hull comes down: released off the board, or
    // onto a square it cannot take, it snaps back to where it was. Leaving it
    // lifted would erase it from the board entirely.
    setLifted(null);
    if (!d || !d.moved || !d.at) {
      setGhost(null);
      return;
    }
    const s = fleet[d.ship];
    if (s) tryPlace(d.ship, d.at.x, d.at.y, layOf(s, horiz));
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
        tryPlace(sel, x, y, layOf(s, horiz));
        return;
      }
    }
    if (ship !== undefined) {
      props.onSel(ship);
      setGhost(null);
    }
  };

  const waiting = fleet.filter((s) => !s.placed);

  return (
    <div
      className="bs-place"
      ref={wrapRef}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        drag.current = null;
        setGhost(null);
        setLifted(null); // a cancelled drag must not leave a hull in the air
      }}
      onPointerLeave={(e) => {
        // a touch "leaves" on release — only a mouse leaving clears the ghost
        if (e.pointerType !== 'touch' && !drag.current) setGhost(null);
      }}
    >
      <div className="bs-tray">
        {waiting.length === 0 ? (
          <span className="bs-tray-done">Fleet on the water ⚓</span>
        ) : (
          waiting.map((s) => {
            const i = fleet.indexOf(s);
            return (
              <button
                key={s.name}
                className={i === sel ? 'bs-chip on' : 'bs-chip'}
                disabled={locked}
                onPointerDown={() => onTrayDown(i)}
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false; // that click was the end of a drag
                    return;
                  }
                  // pointerdown already selected it; a tap on the one already
                  // in hand turns it, exactly like tapping a hull on the board
                  if (down.current.wasSel) props.onRotate();
                }}
              >
                <span className="bs-chip-name">{s.name}</span>
                <span className="bs-chip-bars">{'▮'.repeat(s.size)}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="bs-grid bs-drop" ref={gridRef}>
        {Array.from({ length: SIZE * SIZE }, (_, i) => {
          const ship = shipAt.get(i);
          const onGhost = ghost !== null && ghost.cells.includes(i);
          // a legal landing spot is drawn as the hull, not as a green stand-in:
          // dragging should look like moving the ship, because it is
          const carrying = onGhost && ghost.ok;
          const g = onGhost ? (ghost.ok ? ' bs-lift' : ' bs-ghost bs-bad') : '';
          const on = ship !== undefined && ship === sel ? ' bs-sel' : '';
          return (
            <Cell
              key={i}
              cell={ship === undefined && !carrying ? 'water' : 'ship'}
              extra={`${on}${g}`}
              disabled={locked}
              onPointerDown={() => onCellDown(i)}
              onClick={() => onTap(i)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Exported for the hand view's rotate button — a tray hull always rotates. */
export const canRotate = (fleet: Ship[], i: number | null): boolean => {
  if (i === null) return false;
  const s = fleet[i];
  if (!s) return false;
  return !s.placed || canPlace(fleet, i, s.x, s.y, !s.horizontal) !== null;
};
