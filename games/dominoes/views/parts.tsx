import { useEffect, useRef } from 'react';
import { avatarFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import { halves, PIP_SPOTS } from '../tiles.js';
import type { DomView } from '../game.js';

/** One half of a tile: pips as dots in a 3x3 grid, never as a number. */
export function Half({ n }: { n: number }) {
  const spots = PIP_SPOTS[n] ?? [];
  return (
    <span className="dom-half">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={spots.includes(i) ? 'dom-dot on' : 'dom-dot'} />
      ))}
    </span>
  );
}

export function Tile({
  a,
  b,
  size,
  vertical,
}: {
  a: number;
  b: number;
  size?: 'big';
  vertical?: boolean;
}) {
  const cls = ['dom-tile', vertical ? 'up' : 'flat', size === 'big' ? 'big' : ''].join(' ');
  return (
    <span className={cls}>
      <Half n={a} />
      <span className="dom-divider" />
      <Half n={b} />
    </span>
  );
}

/** A tile straight from a hand id, in its canonical orientation. */
export function TileById({ id, size, vertical }: { id: string; size?: 'big'; vertical?: boolean }) {
  const [a, b] = halves(id);
  return <Tile a={a} b={b} size={size} vertical={vertical} />;
}

/**
 * The line as laid, with its two open ends flagged. The strip scrolls sideways
 * when the line outgrows the screen, and follows whichever end just grew — the
 * tile somebody has this second played is the one worth looking at.
 */
export function Chain({ view, size }: { view: DomView; size?: 'big' }) {
  const box = useRef<HTMLDivElement>(null);
  const head = view.chain[0]?.id ?? '';
  const prevHead = useRef(head);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const grewLeft = prevHead.current !== head;
    prevHead.current = head;
    el.scrollLeft = grewLeft ? 0 : el.scrollWidth;
  }, [view.chain.length, head]);
  return (
    <div className={size === 'big' ? 'dom-chainbox big' : 'dom-chainbox'} ref={box}>
      <div className="dom-chain">
        <span className="dom-endflag">◀</span>
        {view.chain.map((t, i) => (
          <span key={`${t.id}-${i}`} className="dom-link">
            <Tile a={t.a} b={t.b} size={size} />
          </span>
        ))}
        <span className="dom-endflag">▶</span>
      </div>
    </div>
  );
}

/**
 * The two numbers you have to match, big enough to read across a room. A blank
 * end is a real thing in dominoes, so it says so rather than showing nothing.
 */
export function OpenEnds({ view }: { view: DomView }) {
  const End = ({ n, label }: { n: number; label: string }) => (
    <span className="dom-end">
      <span className="dom-endlabel">{label}</span>
      {n === 0 ? <span className="dom-blank">blank</span> : <Half n={n} />}
    </span>
  );
  return (
    <div className="dom-ends">
      <End n={view.left} label="◀ left" />
      <span className="dom-endgap">open ends</span>
      <End n={view.right} label="right ▶" />
    </div>
  );
}

export function nameOf(view: DomView, players: PlayerInfo[], i: number): string {
  return players[i]?.name ?? view.names[i] ?? '…';
}

export function Seats({ view, players }: { view: DomView; players: PlayerInfo[] }) {
  return (
    <div className="dom-seats">
      {view.counts.map((count, i) => {
        const cls = ['dom-seat'];
        if (i === view.turn && !view.finished) cls.push('current');
        if (i === view.winner) cls.push('winner');
        return (
          <span key={i} className={cls.join(' ')}>
            <span className="dom-avatar">{players[i]?.avatar ?? avatarFor(view.names[i] ?? '?')}</span>
            <span className="dom-name">{nameOf(view, players, i)}</span>
            <span className="dom-count">{count}</span>
            {view.pips && <span className="dom-pips">{view.pips[i]} pips</span>}
          </span>
        );
      })}
      <span className="dom-seat boneyard">
        <span className="dom-avatar">📦</span>
        <span className="dom-name">boneyard</span>
        <span className="dom-count">{view.boneyard}</span>
      </span>
    </div>
  );
}
