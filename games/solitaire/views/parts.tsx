import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { isRed, rankLabel, SUITS, suitOf, topOf } from '../lib.js';
import type { SolView } from '../game.js';

/** What the player has picked up: a waste card, a tableau run, a foundation top. */
export type Sel =
  | { kind: 'waste' }
  | { kind: 'pile'; pile: number; index: number }
  | { kind: 'foundation'; suit: number };

/** Where a selection may be dropped. */
export type Dest = { kind: 'pile'; pile: number } | { kind: 'foundation'; suit: number };

/** Every tappable spot on the board; `index: null` is an empty pile. */
export type Tap =
  | { kind: 'stock' }
  | { kind: 'waste' }
  | { kind: 'pile'; pile: number; index: number | null }
  | { kind: 'foundation'; suit: number };

export const selKey = (s: Sel): string =>
  s.kind === 'pile' ? `p${s.pile}:${s.index}` : s.kind === 'foundation' ? `f${s.suit}` : 'w';

/*
 * Geometry. Every length is in units of --sol-w (one card's width); a card is
 * 1.4 of those tall. A covered card must still show its corner index, so a
 * face-up card gives the one below it a sliver of UP_STEP — comfortably more
 * than the corner's rank+suit line. Face-down cards carry no information, so
 * they stay packed at DOWN_STEP (mirrored in style.css).
 */
const CARD_H = 1.4;
const DOWN_STEP = 0.26;
const UP_STEP = 0.62;
/** Floor for the sliver: still legible, used only by absurdly long piles. */
const UP_TIGHT = 0.48;
/** A pile may not grow past this — the column has to stay on one phone screen. */
const PILE_MAX = 8;

/**
 * The sliver each face-up card leaves for the one under it. Full size until the
 * column would outgrow the screen, then tightened just enough to fit.
 */
export function upStep(down: number, up: number): number {
  if (up <= 1) return UP_STEP;
  // the first card of the column is the only one at full height
  const before = down > 0 ? CARD_H + (down - 1) * DOWN_STEP : CARD_H;
  const stepped = down > 0 ? up : up - 1;
  const room = (PILE_MAX - before) / stepped;
  return Math.round(Math.max(UP_TIGHT, Math.min(UP_STEP, room)) * 1000) / 1000;
}

/** The cards a selection picks up, or null when there is nothing there. */
export function selectedRun(view: SolView, sel: Sel | null): number[] | null {
  if (!sel) return null;
  if (sel.kind === 'waste') return view.wasteTop === null ? null : [view.wasteTop];
  if (sel.kind === 'foundation') {
    const card = topOf(view.foundations[sel.suit] ?? []);
    return card === null ? null : [card];
  }
  const up = view.tableau[sel.pile]?.up ?? [];
  return sel.index >= 0 && sel.index < up.length ? up.slice(sel.index) : null;
}

/** True when the selected run is its pile's whole contents (nothing under it). */
export function selIsWholePile(view: SolView, sel: Sel | null): boolean {
  if (!sel || sel.kind !== 'pile') return false;
  return sel.index === 0 && (view.tableau[sel.pile]?.down ?? 0) === 0;
}

/** The step of the pile a selection came from, so a dragged run keeps its shape. */
export function selStep(view: SolView, sel: Sel): number {
  if (sel.kind !== 'pile') return UP_STEP;
  const p = view.tableau[sel.pile];
  return p ? upStep(p.down, p.up.length) : UP_STEP;
}

const destId = (d: Dest): string => (d.kind === 'foundation' ? `f${d.suit}` : `p${d.pile}`);

export const sameDest = (a: Dest | null, b: Dest | null): boolean =>
  a !== null && b !== null && destId(a) === destId(b);

/**
 * The drop target under a screen point. Drags capture the pointer, so the
 * element under the finger has to be looked up rather than received as a
 * target; the dragged run's ghost is pointer-events: none so it never wins.
 */
export function destAt(x: number, y: number): Dest | null {
  const hit = document.elementFromPoint(x, y);
  const node = hit ? hit.closest('[data-sol-dest]') : null;
  const id = node instanceof HTMLElement ? node.dataset.solDest : undefined;
  if (!id) return null;
  const n = Number(id.slice(1));
  if (!Number.isInteger(n)) return null;
  return id[0] === 'f' ? { kind: 'foundation', suit: n } : { kind: 'pile', pile: n };
}

/** The pointer handlers that make one card draggable (supplied by the hand view). */
export interface GrabHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

/** A run in flight: what it is, where it came from, how tightly it stacks. */
export interface DragInfo {
  sel: Sel;
  run: number[];
  /** Viewport position of the grabbed card, so the ghost starts exactly on it. */
  left: number;
  top: number;
  step: number;
}

function CardFace(props: {
  card: number | null;
  down?: boolean;
  /** Rank + suit in the top-left corner, so a covered card is still readable. */
  corner?: boolean;
  ghost?: string;
  sel?: boolean;
  hot?: boolean;
  flying?: boolean;
  onTap?: (() => void) | undefined;
  grab?: GrabHandlers | undefined;
}) {
  const classes = ['sol-card'];
  if (props.down) classes.push('down');
  else if (props.card === null) classes.push('slot');
  else if (isRed(props.card)) classes.push('red');
  if (props.corner && props.card !== null && !props.down) classes.push('corner');
  if (props.sel) classes.push('sel');
  if (props.hot) classes.push('hot');
  if (props.flying) classes.push('flying');
  return (
    <button
      className={classes.join(' ')}
      disabled={!props.onTap}
      onClick={props.onTap}
      {...(props.grab ?? {})}
    >
      {props.down || props.card === null ? (
        <span className="sol-ghost">{props.down ? '' : (props.ghost ?? '')}</span>
      ) : (
        <>
          <span className="sol-rank">{rankLabel(props.card)}</span>
          <span className="sol-suit">{SUITS[suitOf(props.card)]}</span>
        </>
      )}
    </button>
  );
}

export interface BoardProps {
  view: SolView;
  /** Table screen: bigger cards, and no handlers at all. */
  big?: boolean;
  sel?: Sel | null;
  isHot?: (dest: Dest) => boolean;
  onTap?: (t: Tap) => void;
  /** Rendered as ⤒ on the selected card when it can go straight home. */
  onHome?: (() => void) | undefined;
  /** Pointer handlers for a grabbable card — undefined where dragging is off. */
  grab?: ((sel: Sel) => GrabHandlers | undefined) | undefined;
  /** Fires on every press anywhere on the board (used to re-arm the tap path). */
  onDown?: (() => void) | undefined;
  /** The run currently in flight, drawn as a ghost that follows the finger. */
  drag?: DragInfo | null;
  ghostRef?: RefObject<HTMLDivElement | null>;
  /** The destination under the finger right now. */
  hover?: Dest | null;
}

export function Board({
  view,
  big,
  sel,
  isHot,
  onTap,
  onHome,
  grab,
  onDown,
  drag,
  ghostRef,
  hover,
}: BoardProps) {
  const tap = (t: Tap) => (onTap ? () => onTap(t) : undefined);
  const hot = (d: Dest) => isHot?.(d) === true;
  /** A legal destination the finger is actually over. */
  const dropping = (d: Dest) => (hot(d) && sameDest(hover ?? null, d) ? ' sol-drop' : '');
  const homeBtn = (
    <button className="sol-home" onClick={onHome}>
      ⤒
    </button>
  );

  /** Cards riding along with the drag: drawn faint, since the ghost has them. */
  const inFlight = (s: Sel): boolean => {
    const d = drag?.sel;
    if (!d) return false;
    if (d.kind === 'waste') return s.kind === 'waste';
    if (d.kind === 'foundation') return s.kind === 'foundation' && s.suit === d.suit;
    return s.kind === 'pile' && s.pile === d.pile && s.index >= d.index;
  };

  return (
    <div className={big ? 'sol-board big' : 'sol-board'} onPointerDown={onDown}>
      <div className="sol-row">
        {view.foundations.map((f, suit) => (
          <div
            className={`sol-slot${dropping({ kind: 'foundation', suit })}`}
            key={suit}
            data-sol-dest={`f${suit}`}
          >
            <CardFace
              card={topOf(f)}
              ghost={SUITS[suit]}
              sel={sel?.kind === 'foundation' && sel.suit === suit}
              hot={hot({ kind: 'foundation', suit })}
              flying={inFlight({ kind: 'foundation', suit })}
              onTap={tap({ kind: 'foundation', suit })}
              grab={topOf(f) === null ? undefined : grab?.({ kind: 'foundation', suit })}
            />
          </div>
        ))}
        <div className="sol-gap" />
        {/* the waste sits left of the stock: the pile you TAP is the one under
            the thumb, at the far right of the row */}
        <div className="sol-slot">
          <span className="sol-wrap waste">
            <CardFace
              card={view.wasteTop}
              corner
              sel={sel?.kind === 'waste'}
              flying={inFlight({ kind: 'waste' })}
              onTap={view.wasteTop === null ? undefined : tap({ kind: 'waste' })}
              grab={view.wasteTop === null ? undefined : grab?.({ kind: 'waste' })}
            />
            {onHome && sel?.kind === 'waste' && homeBtn}
          </span>
          <span className="sol-count">{view.wasteCount}</span>
        </div>
        <div className="sol-slot">
          <CardFace
            card={null}
            down={view.stockCount > 0}
            ghost={view.wasteCount > 0 ? '↺' : ''}
            onTap={tap({ kind: 'stock' })}
          />
          <span className="sol-count">{view.stockCount}</span>
        </div>
      </div>

      <div className="sol-row sol-piles">
        {view.tableau.map((p, i) => (
          <div
            className={`sol-pile${dropping({ kind: 'pile', pile: i })}`}
            key={i}
            data-sol-dest={`p${i}`}
            style={{ '--sol-up': upStep(p.down, p.up.length) } as CSSProperties}
          >
            {p.down === 0 && p.up.length === 0 ? (
              <CardFace
                card={null}
                hot={hot({ kind: 'pile', pile: i })}
                onTap={tap({ kind: 'pile', pile: i, index: null })}
              />
            ) : (
              <>
                {Array.from({ length: p.down }, (_, k) => (
                  <CardFace key={`d${k}`} card={null} down />
                ))}
                {p.up.map((card, k) => (
                  <span className="sol-wrap" key={card}>
                    <CardFace
                      card={card}
                      corner
                      sel={sel?.kind === 'pile' && sel.pile === i && k >= sel.index}
                      hot={k === p.up.length - 1 && hot({ kind: 'pile', pile: i })}
                      flying={inFlight({ kind: 'pile', pile: i, index: k })}
                      onTap={tap({ kind: 'pile', pile: i, index: k })}
                      grab={grab?.({ kind: 'pile', pile: i, index: k })}
                    />
                    {onHome &&
                      sel?.kind === 'pile' &&
                      sel.pile === i &&
                      sel.index === k &&
                      k === p.up.length - 1 &&
                      homeBtn}
                  </span>
                ))}
              </>
            )}
          </div>
        ))}
      </div>

      {drag && (
        <div
          className="sol-drag"
          ref={ghostRef}
          style={{ left: drag.left, top: drag.top, '--sol-up': drag.step } as CSSProperties}
        >
          {drag.run.map((card) => (
            <CardFace key={card} card={card} corner />
          ))}
        </div>
      )}
    </div>
  );
}
