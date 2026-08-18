import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { avatarFor, colorFor } from '../../../src/shared/avatar.js';
import type { MemoryState } from '../game.js';

export function Scoreboard(props: { view: MemoryState; over: boolean; small?: boolean }) {
  const { view } = props;
  return (
    <div className={props.small ? 'mem-scores small' : 'mem-scores'}>
      {view.playerNames.map((name, i) => (
        <div
          key={i}
          className={!props.over && i === view.current ? 'mem-player current' : 'mem-player'}
          style={{ '--seat': colorFor(i) } as CSSProperties}
        >
          <span className="mem-avatar">{avatarFor(name)}</span>
          <span className="mem-name">{name}</span>
          <strong>{view.scores[i]}</strong>
        </div>
      ))}
    </div>
  );
}

export function Grid(props: {
  view: MemoryState;
  cols: number;
  disabled: boolean;
  /** Omit to render a display-only grid (the table screen). */
  onFlip?: (i: number) => void;
}) {
  const { view, cols } = props;
  const rows = Math.ceil(view.cards.length / cols);
  return (
    <div
      className="mem-grid"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, '--ar': cols / rows } as CSSProperties}
    >
      {view.cards.map((c, i) => (
        <button
          key={i}
          className={`mem-card ${c.state}`}
          disabled={!props.onFlip || props.disabled || c.state !== 'down'}
          onClick={() => props.onFlip?.(i)}
          style={c.matchedBy !== null ? ({ '--owner': colorFor(c.matchedBy) } as CSSProperties) : undefined}
        >
          <span className="mem-inner">
            <span className="mem-face mem-back">✦</span>
            <span className="mem-face mem-front">{c.face}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const CONFETTI = ['🎉', '✨', '🎊', '⭐'];

export function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: (i * 37 + 13) % 100,
        delay: (i % 7) * 0.3,
        char: CONFETTI[i % CONFETTI.length]!,
      })),
    [],
  );
  return (
    <div className="mem-confetti" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s` }}>
          {b.char}
        </span>
      ))}
    </div>
  );
}
