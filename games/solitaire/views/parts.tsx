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

function CardFace(props: {
  card: number | null;
  down?: boolean;
  slot?: boolean;
  ghost?: string;
  sel?: boolean;
  hot?: boolean;
  onTap?: (() => void) | undefined;
}) {
  const classes = ['sol-card'];
  if (props.down) classes.push('down');
  else if (props.card === null) classes.push('slot');
  else if (isRed(props.card)) classes.push('red');
  if (props.sel) classes.push('sel');
  if (props.hot) classes.push('hot');
  return (
    <button className={classes.join(' ')} disabled={!props.onTap} onClick={props.onTap}>
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
}

export function Board({ view, big, sel, isHot, onTap, onHome }: BoardProps) {
  const tap = (t: Tap) => (onTap ? () => onTap(t) : undefined);
  const hot = (d: Dest) => isHot?.(d) === true;
  const homeBtn = (
    <button className="sol-home" onClick={onHome}>
      ⤒
    </button>
  );

  return (
    <div className={big ? 'sol-board big' : 'sol-board'}>
      <div className="sol-row">
        {view.foundations.map((f, suit) => (
          <div className="sol-slot" key={suit}>
            <CardFace
              card={topOf(f)}
              ghost={SUITS[suit]}
              sel={sel?.kind === 'foundation' && sel.suit === suit}
              hot={hot({ kind: 'foundation', suit })}
              onTap={tap({ kind: 'foundation', suit })}
            />
          </div>
        ))}
        <div className="sol-gap" />
        <div className="sol-slot">
          <CardFace
            card={null}
            down={view.stockCount > 0}
            ghost={view.wasteCount > 0 ? '↺' : ''}
            onTap={tap({ kind: 'stock' })}
          />
          <span className="sol-count">{view.stockCount}</span>
        </div>
        <div className="sol-slot">
          <span className="sol-wrap">
            <CardFace
              card={view.wasteTop}
              sel={sel?.kind === 'waste'}
              onTap={view.wasteTop === null ? undefined : tap({ kind: 'waste' })}
            />
            {onHome && sel?.kind === 'waste' && homeBtn}
          </span>
          <span className="sol-count">{view.wasteCount}</span>
        </div>
      </div>

      <div className="sol-row sol-piles">
        {view.tableau.map((p, i) => (
          <div className="sol-pile" key={i}>
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
                      sel={sel?.kind === 'pile' && sel.pile === i && k >= sel.index}
                      hot={k === p.up.length - 1 && hot({ kind: 'pile', pile: i })}
                      onTap={tap({ kind: 'pile', pile: i, index: k })}
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
    </div>
  );
}
