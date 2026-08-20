import './style.css';
import { useRef, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { canFound, canMoveRun, pileSource, suitOf, topOf } from '../lib.js';
import type { SolView } from '../game.js';
import { Board, selectedRun, selIsWholePile, selKey } from './parts.js';
import type { Dest, Sel, Tap } from './parts.js';

const DOUBLE_TAP_MS = 400;

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
  const lastTap = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  const run = selectedRun(view, sel);

  const isHot = (dest: Dest): boolean => {
    if (!sel || !run || run.length === 0) return false;
    const head = run[0]!;
    if (dest.kind === 'foundation') {
      if (sel.kind === 'foundation' || run.length !== 1) return false;
      return suitOf(head) === dest.suit && canFound(head, topOf(view.foundations[dest.suit] ?? []));
    }
    if (sel.kind === 'pile' && sel.pile === dest.pile) return false;
    return canMoveRun(head, selIsWholePile(view, sel), topOf(view.tableau[dest.pile]?.up ?? []));
  };

  const drop = (dest: Dest): void => {
    if (!sel) return;
    if (sel.kind === 'foundation') {
      if (dest.kind === 'pile') move('moveFoundationToTableau', sel.suit, dest.pile);
    } else {
      const from = sel.kind === 'waste' ? 'waste' : pileSource(sel.pile);
      if (dest.kind === 'foundation') move('moveToFoundation', from);
      else move('moveToTableau', from, sel.kind === 'waste' ? 0 : sel.index, dest.pile);
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
    if (sel && dest && isHot(dest)) {
      drop(dest);
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
      <p className="sol-hint">tap a card, then tap where it goes · double-tap sends it home</p>
    </div>
  );
}
