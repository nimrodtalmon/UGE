import './style.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { canFound, canMoveRun, pileSource, suitOf, topOf } from '../lib.js';
import type { SolView } from '../game.js';
import { Board, destAt, sameDest, selectedRun, selIsWholePile, selKey, selStep } from './parts.js';
import type { Dest, DragInfo, GrabHandlers, Sel, Tap } from './parts.js';

const DOUBLE_TAP_MS = 400;
/** Below this much finger travel a press is still a TAP, not a drag. */
const DRAG_SLOP = 8;
/** How far the run rides above the finger while it is in flight. */
const DRAG_LIFT = 10;
/** Snap-back animation; the ghost lives this much longer than a failed drop. */
const SNAP_MS = 170;

/** A press in progress: it becomes a drag only once it moves past the slop. */
interface Grab {
  sel: Sel;
  id: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  moved: boolean;
}

/** Only cards you can pick up become selections; empty piles never do. */
function tapAsSel(view: SolView, t: Tap): Sel | null {
  if (t.kind === 'waste') return view.wasteTop === null ? null : { kind: 'waste' };
  if (t.kind === 'foundation') {
    const top = topOf(view.foundations[t.suit] ?? []);
    return top === null ? null : { kind: 'foundation', suit: t.suit };
  }
  if (t.kind === 'pile' && t.index !== null) return { kind: 'pile', pile: t.pile, index: t.index };
  return null;
}

export default function HandView({ view, me, over, move }: GameViewProps<SolView>) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [hover, setHover] = useState<Dest | null>(null);
  const lastTap = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const grab = useRef<Grab | null>(null);
  /** A press that turned into a drag must not also count as a tap. */
  const dragged = useRef(false);
  const ghost = useRef<HTMLDivElement | null>(null);
  const snap = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (snap.current) clearTimeout(snap.current);
    },
    [],
  );

  const run = selectedRun(view, sel);
  // a run in flight is what the board reasons about; otherwise it's the selection
  const activeSel = drag ? drag.sel : sel;
  const activeRun = drag ? drag.run : run;

  /** The one legality check both the tap path and the drag path go through. */
  const isHotFor = (s: Sel | null, cards: number[] | null, dest: Dest): boolean => {
    if (!s || !cards || cards.length === 0) return false;
    const head = cards[0]!;
    if (dest.kind === 'foundation') {
      if (s.kind === 'foundation' || cards.length !== 1) return false;
      return suitOf(head) === dest.suit && canFound(head, topOf(view.foundations[dest.suit] ?? []));
    }
    if (s.kind === 'pile' && s.pile === dest.pile) return false;
    return canMoveRun(head, selIsWholePile(view, s), topOf(view.tableau[dest.pile]?.up ?? []));
  };
  const isHot = (dest: Dest): boolean => isHotFor(activeSel, activeRun, dest);

  /** Both paths end here: the same moves, with the server checking them again. */
  const play = (s: Sel, dest: Dest): void => {
    if (s.kind === 'foundation') {
      if (dest.kind === 'pile') move('moveFoundationToTableau', s.suit, dest.pile);
    } else {
      const from = s.kind === 'waste' ? 'waste' : pileSource(s.pile);
      if (dest.kind === 'foundation') move('moveToFoundation', from);
      else move('moveToTableau', from, s.kind === 'waste' ? 0 : s.index, dest.pile);
    }
    setSel(null);
  };

  /** Send a single card straight to its foundation, if that is legal. */
  const sendHome = (s: Sel): boolean => {
    if (s.kind === 'foundation') return false;
    const cards = selectedRun(view, s);
    if (!cards || cards.length !== 1) return false;
    const card = cards[0]!;
    if (!canFound(card, topOf(view.foundations[suitOf(card)] ?? []))) return false;
    move('moveToFoundation', s.kind === 'waste' ? 'waste' : pileSource(s.pile));
    setSel(null);
    return true;
  };

  const onTap = (t: Tap): void => {
    if (over) return;
    // the click that closes a drag: the drop already happened (or was refused)
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (t.kind === 'stock') {
      setSel(null);
      move('drawStock');
      return;
    }
    // the waste is a source only — everything else can be dropped onto
    const dest: Dest | null =
      t.kind === 'foundation'
        ? { kind: 'foundation', suit: t.suit }
        : t.kind === 'pile'
          ? { kind: 'pile', pile: t.pile }
          : null;
    if (sel && dest && isHotFor(sel, run, dest)) {
      play(sel, dest);
      return;
    }
    const next = tapAsSel(view, t);
    if (!next) {
      setSel(null);
      return;
    }
    const key = selKey(next);
    const at = Date.now();
    if (lastTap.current.key === key && at - lastTap.current.at < DOUBLE_TAP_MS) {
      lastTap.current = { key: '', at: 0 };
      if (sendHome(next)) return;
    }
    lastTap.current = { key, at };
    setSel(sel !== null && selKey(sel) === key ? null : next);
  };

  const placeGhost = (dx: number, dy: number): void => {
    const el = ghost.current;
    if (el) el.style.transform = `translate(${dx}px, ${dy - DRAG_LIFT}px) scale(1.04)`;
  };

  // the ghost mounts a frame after the drag starts — put it under the finger
  useLayoutEffect(() => {
    const g = grab.current;
    const el = ghost.current;
    if (!drag || !g || !el) return;
    el.style.transition = 'none';
    placeGhost(g.dx, g.dy);
  }, [drag]);

  const clearSnap = (): void => {
    if (!snap.current) return;
    clearTimeout(snap.current);
    snap.current = null;
    setDrag(null);
  };

  /** Nothing legal under the finger: fly the run back where it came from. */
  const snapBack = (): void => {
    const el = ghost.current;
    if (!el) {
      setDrag(null);
      return;
    }
    el.style.transition = `transform ${SNAP_MS}ms ease-out`;
    el.style.transform = 'translate(0px, 0px) scale(1)';
    snap.current = setTimeout(() => {
      snap.current = null;
      setDrag(null);
    }, SNAP_MS);
  };

  const endDrag = (x: number | null, y: number | null): void => {
    const g = grab.current;
    grab.current = null;
    setHover(null);
    if (!g || !g.moved) {
      setDrag(null);
      return; // a tap — the click handler picks it up from here
    }
    const dest = x === null || y === null ? null : destAt(x, y);
    const cards = selectedRun(view, g.sel);
    if (dest && isHotFor(g.sel, cards, dest)) {
      setDrag(null);
      play(g.sel, dest);
      return;
    }
    snapBack();
  };

  /** Makes one card draggable: press, follow the finger, release on a target. */
  const grabHandlers = (s: Sel): GrabHandlers | undefined => {
    if (over) return undefined;
    return {
      onPointerDown(e) {
        if (!e.isPrimary) return;
        clearSnap();
        dragged.current = false;
        const at = { x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
        grab.current = { sel: s, id: e.pointerId, moved: false, ...at };
        // capture so the run keeps following the finger off the card it started on
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove(e) {
        const g = grab.current;
        if (!g || g.id !== e.pointerId) return;
        g.dx = e.clientX - g.x0;
        g.dy = e.clientY - g.y0;
        if (!g.moved) {
          if (Math.hypot(g.dx, g.dy) < DRAG_SLOP) return; // still a tap
          const cards = selectedRun(view, g.sel);
          if (!cards || cards.length === 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          g.moved = true;
          dragged.current = true;
          setDrag({
            sel: g.sel,
            run: cards,
            left: rect.left,
            top: rect.top,
            step: selStep(view, g.sel),
          });
        }
        placeGhost(g.dx, g.dy);
        const d = destAt(e.clientX, e.clientY);
        setHover((prev) => (sameDest(prev, d) ? prev : d));
      },
      onPointerUp(e) {
        endDrag(e.clientX, e.clientY);
      },
      onPointerCancel() {
        endDrag(null, null);
      },
    };
  };

  // the ⤒ badge rides the selected card, and only when that card can go home
  const single = !over && run !== null && run.length === 1 ? run[0]! : null;
  const homeSel =
    sel !== null &&
    sel.kind !== 'foundation' &&
    single !== null &&
    canFound(single, topOf(view.foundations[suitOf(single)] ?? []))
      ? sel
      : null;

  return (
    <div className="sol-screen">
      {/* one status line all game: "no moves left" wraps where the count doesn't */}
      <p className={over ? 'sol-status won' : view.stuck ? 'sol-status stuck' : 'sol-status'}>
        {over
          ? over.text
          : view.stuck
            ? 'no moves left — deal again?'
            : `${me ? `${me.name} — ` : ''}${view.moves} moves`}
      </p>

      <Board
        view={view}
        sel={sel}
        isHot={isHot}
        onTap={onTap}
        onHome={homeSel ? () => void sendHome(homeSel) : undefined}
        grab={grabHandlers}
        onDown={() => {
          dragged.current = false;
        }}
        drag={drag}
        ghostRef={ghost}
        hover={hover}
      />

      {/* reserved all game — a button appearing must not shove the board upward */}
      <div className="sol-actions">
        {view.canAutoFinish && !over && (
          <button className="sol-btn primary" onClick={() => move('autoFinish')}>
            ⤒ Auto-finish
          </button>
        )}
        {view.stuck && !over && (
          <button className="sol-btn" onClick={() => move('restart')}>
            Deal again
          </button>
        )}
      </div>
      <p className="sol-hint">drag, or tap then tap · double-tap sends a card home</p>
    </div>
  );
}
