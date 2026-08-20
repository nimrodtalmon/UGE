import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useServerClock } from '../../../src/shared/gameKit.js';
import { formatClock } from '../game.js';
import type { MsView } from '../game.js';

/** Long-press to flag while in dig mode (the segmented control is the main way). */
const HOLD_MS = 450;

/** Elapsed run time, anchored to the server clock and frozen once the game ends. */
export function useElapsed(view: MsView, serverNow: number): number {
  const clock = useServerClock(serverNow);
  const [, tick] = useState(0);
  const running = view.startedAt !== null && view.endedAt === null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [running]);
  if (view.startedAt === null) return 0;
  return (view.endedAt ?? clock()) - view.startedAt;
}

export function Header(props: { view: MsView; elapsed: number; children?: ReactNode }) {
  const left = props.view.mines - props.view.flags;
  return (
    <div className="ms-header">
      <span className="ms-readout" title="mines left">
        💣 {left}
      </span>
      <span className="ms-readout" title="elapsed">
        ⏱ {formatClock(props.elapsed)}
      </span>
      {props.children}
    </div>
  );
}

/**
 * The board. Omit onTap for a display-only grid (the table screen).
 * onHold, when given, fires after a long press instead of the tap.
 */
export function Board(props: {
  view: MsView;
  big?: boolean;
  onTap?: (x: number, y: number) => void;
  onHold?: (x: number, y: number) => void;
}) {
  const { view } = props;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const live = props.view.status === 'playing' && !!props.onTap;

  const clear = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clear, []);

  const hold = (x: number, y: number): void => {
    if (!props.onHold) return;
    held.current = false;
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      held.current = true;
      navigator.vibrate?.(30);
      props.onHold?.(x, y);
    }, HOLD_MS);
  };

  const tap = (x: number, y: number): void => {
    clear();
    if (held.current) {
      held.current = false; // the long press already acted
      return;
    }
    props.onTap?.(x, y);
  };

  return (
    <div className={props.big ? 'ms-board big' : 'ms-board'}>
      <div
        className="ms-grid"
        style={{ '--ms-w': view.w, '--ms-h': view.h } as CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
      >
        {view.cells.map((cell, i) => {
          const x = i % view.w;
          const y = Math.floor(i / view.w);
          const mine = cell.mine;
          const wrongFlag = view.status !== 'playing' && cell.flag && !mine;
          const classes = ['ms-cell'];
          if (mine) classes.push('ms-cell-mine');
          else if (cell.revealed) classes.push('ms-cell-open', `ms-n${cell.count}`);
          if (wrongFlag) classes.push('ms-cell-wrong');
          if (mine && i === view.boom) classes.push('ms-cell-boom');
          return (
            <button
              key={i}
              className={classes.join(' ')}
              disabled={!live}
              aria-label={`cell ${x + 1}, ${y + 1}`}
              onPointerDown={() => hold(x, y)}
              onPointerUp={clear}
              onPointerLeave={clear}
              onPointerCancel={clear}
              onClick={() => tap(x, y)}
            >
              {mine ? '💣' : cell.flag ? '🚩' : cell.revealed && cell.count > 0 ? cell.count : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
