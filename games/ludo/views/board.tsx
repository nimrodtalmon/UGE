import { avatarFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import {
  BASE,
  COLOUR_NAMES,
  HOME,
  RING_CELLS,
  SAFE,
  START,
  cellOf,
  destinationOf,
  homeCells,
} from '../game.js';
import type { Cell, LudoView } from '../game.js';

/**
 * The cross-shaped board, and the small pieces the two role views share.
 * The 15x15 grid is painted once from the geometry exported by game.ts; the
 * tokens float above it, absolutely positioned, so a token moving never
 * reflows a single cell.
 */

const SIZE = 15;
const key = (cell: Cell): number => cell.r * SIZE + cell.c;

type CellKind = 'track' | 'lane' | 'hub' | 'yard';

/** Painted once: what every one of the 225 squares is, and in whose colour. */
const KINDS: CellKind[] = new Array<CellKind>(SIZE * SIZE).fill('yard');
const TINT: (number | null)[] = new Array<number | null>(SIZE * SIZE).fill(null);
const SAFE_CELL: boolean[] = new Array<boolean>(SIZE * SIZE).fill(false);

for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    const q = r < 6 ? (c < 6 ? 0 : 1) : c < 6 ? 3 : 2;
    TINT[r * SIZE + c] = q;
  }
}
RING_CELLS.forEach((cell, i) => {
  KINDS[key(cell)] = 'track';
  TINT[key(cell)] = START.indexOf(i) >= 0 ? START.indexOf(i) : null;
  if (SAFE.includes(i)) SAFE_CELL[key(cell)] = true;
});
[0, 1, 2, 3].forEach((q) => {
  for (const cell of homeCells(q)) {
    KINDS[key(cell)] = 'lane';
    TINT[key(cell)] = q;
  }
});
for (let r = 6; r <= 8; r++) {
  for (let c = 6; c <= 8; c++) {
    KINDS[r * SIZE + c] = 'hub';
    TINT[r * SIZE + c] = null;
  }
}

const pct = (n: number): string => `${((n + 0.5) / SIZE) * 100}%`;

/** A token stacked with others gets nudged so both stay readable. */
const NUDGE = [
  { x: 0, y: 0 },
  { x: -0.22, y: -0.2 },
  { x: 0.22, y: 0.2 },
  { x: 0.22, y: -0.2 },
  { x: -0.22, y: 0.2 },
];

export interface Placed {
  seat: number;
  token: number;
  colour: number;
  cell: Cell;
  slot: number;
  progress: number;
}

/** Every token on the board, with a stacking slot for the ones sharing a cell. */
export function placeTokens(view: LudoView): Placed[] {
  const used = new Map<number, number>();
  const out: Placed[] = [];
  view.tokens.forEach((row, seat) => {
    const colour = view.colours[seat] ?? 0;
    row.forEach((t, token) => {
      const cell = cellOf(colour, t, token);
      const k = key(cell);
      const slot = used.get(k) ?? 0;
      used.set(k, slot + 1);
      out.push({ seat, token, colour, cell, slot, progress: t });
    });
  });
  return out;
}

function DiePips({ n }: { n: number }) {
  // which of the nine positions carry a pip, per face
  const faces: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const on = faces[n] ?? [];
  return (
    <span className="ld-die">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={on.includes(i) ? 'ld-pip on' : 'ld-pip'} />
      ))}
    </span>
  );
}

/** The die, or an empty tray of the very same size before the first throw. */
export function Die({ n, rolling }: { n: number | null; rolling?: boolean }) {
  return (
    <span className={rolling ? 'ld-dieslot live' : 'ld-dieslot'}>
      {n === null ? <span className="ld-die empty" /> : <DiePips n={n} />}
    </span>
  );
}

export function Board({
  view,
  big,
  onToken,
}: {
  view: LudoView;
  big?: boolean;
  onToken?: (index: number) => void;
}) {
  const placed = placeTokens(view);
  const moving = view.phase === 'move' && view.winner === null;
  const canTap = Boolean(onToken) && moving && view.turn === view.myIndex;
  const die = view.die ?? 0;

  // faint markers on the squares the roll can reach
  const targets = moving
    ? view.legal.map((i) => {
        const to = destinationOf(view, view.turn, i, die);
        return to === null ? null : cellOf(view.colours[view.turn] ?? 0, to, i);
      })
    : [];

  return (
    <div className={big ? 'ld-board big' : 'ld-board'}>
      <div className="ld-grid">
        {Array.from({ length: SIZE * SIZE }, (_, i) => {
          const kind = KINDS[i]!;
          const tint = TINT[i];
          const classes = ['ld-sq', `ld-${kind}`];
          if (tint !== null && tint !== undefined) classes.push(`q${tint}`);
          if (SAFE_CELL[i]) classes.push('safe');
          return <div key={i} className={classes.join(' ')} />;
        })}
      </div>

      {/* the four parking bays, drawn over their quadrants */}
      {[0, 1, 2, 3].map((q) => (
        <div key={q} className={`ld-bay q${q}`} style={bayStyle(q)} />
      ))}
      <div className="ld-hubface">
        {[0, 1, 2, 3].map((q) => (
          <span key={q} className={`ld-wedge q${q}`} />
        ))}
      </div>

      {targets.map((cell, i) =>
        cell === null ? null : (
          <span
            key={`t${i}`}
            className="ld-target"
            style={{ left: pct(cell.c), top: pct(cell.r) }}
          />
        ),
      )}

      {placed.map((p) => {
        const nudge = NUDGE[Math.min(p.slot, NUDGE.length - 1)]!;
        const style = {
          left: `calc(${pct(p.cell.c)} + ${nudge.x * (100 / SIZE)}%)`,
          top: `calc(${pct(p.cell.r)} + ${nudge.y * (100 / SIZE)}%)`,
        };
        const mine = p.seat === view.turn;
        const playable = mine && moving && view.legal.includes(p.token);
        const classes = [
          'ld-token',
          `q${p.colour}`,
          playable && 'lit',
          view.lastMoved?.seat === p.seat && view.lastMoved.token === p.token && 'just',
          view.lastCapture?.seat === p.seat && view.lastCapture.token === p.token && 'bumped',
          p.progress === HOME && 'done',
        ]
          .filter(Boolean)
          .join(' ');
        if (canTap && playable) {
          return (
            <button
              key={`${p.seat}-${p.token}`}
              className={classes}
              style={style}
              onClick={() => onToken?.(p.token)}
              aria-label={`move token ${p.token + 1}`}
            />
          );
        }
        return <span key={`${p.seat}-${p.token}`} className={classes} style={style} />;
      })}
    </div>
  );
}

/**
 * The white parking bay inside a quadrant, sized to hug the four slots: they
 * sit on cells 1 and 4 of the 6x6 corner, i.e. 5%..35% of the board.
 */
function bayStyle(q: number): { left: string; top: string } {
  const near = q === 1 || q === 2 ? '65%' : '5%';
  const down = q === 2 || q === 3 ? '65%' : '5%';
  return { left: near, top: down };
}

export const nameOf = (view: LudoView, players: PlayerInfo[], seat: number): string =>
  players[seat]?.name ?? view.names[seat] ?? COLOUR_NAMES[view.colours[seat] ?? 0] ?? '?';

/** One compact pill per seat: colour, who, and how many tokens are home. */
export function Seats({ view, players }: { view: LudoView; players: PlayerInfo[] }) {
  return (
    <div className="ld-seats">
      {view.tokens.map((row, seat) => {
        const home = row.filter((t) => t === HOME).length;
        const out = row.filter((t) => t !== BASE && t !== HOME).length;
        const classes = ['ld-seat', `q${view.colours[seat] ?? 0}`];
        if (view.turn === seat && view.winner === null) classes.push('current');
        if (view.winner === seat) classes.push('won');
        return (
          <div key={seat} className={classes.join(' ')}>
            <span className="ld-dot" />
            <span className="ld-who">
              {players[seat]?.avatar ?? avatarFor(view.names[seat] ?? '?')}{' '}
              {nameOf(view, players, seat)}
            </span>
            <span className="ld-tally">
              🏁{home}
              <span className="ld-outof">/{view.tokensPer}</span>
            </span>
            <span className="ld-onboard">{out > 0 ? `·${out}` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
