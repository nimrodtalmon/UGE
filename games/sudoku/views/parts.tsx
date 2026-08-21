import { useEffect, useState } from 'react';
import { useServerClock } from '../../../src/shared/gameKit.js';
import type { SdView } from '../game.js';
import { boxOf, colOf, conflicts, formatClock, rowOf } from '../rules.js';

/** Run time, anchored to the server clock and frozen the moment it is solved. */
export function useElapsed(view: SdView, serverNow: number): number {
  const clock = useServerClock(serverNow);
  const [, tick] = useState(0);
  const running = view.endedAt === null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [running]);
  return (view.endedAt ?? clock()) - view.startedAt;
}

/** How many of each digit 1..9 are already on the board. */
export function digitCounts(digits: number[]): number[] {
  const out = new Array<number>(10).fill(0);
  for (const d of digits) if (d >= 1 && d <= 9) out[d] = (out[d] ?? 0) + 1;
  return out;
}

export function Hud({ view, elapsed }: { view: SdView; elapsed: number }) {
  const left = view.digits.filter((d) => d === 0).length;
  return (
    <div className="sd-hud">
      <span className="sd-readout" title="elapsed">
        ⏱ {formatClock(elapsed)}
      </span>
      <span className={view.mistakes > 0 ? 'sd-readout bad' : 'sd-readout'} title="mistakes">
        ✖ {view.mistakes}
      </span>
      <span className="sd-readout" title="blanks left">
        ▦ {left}
      </span>
    </div>
  );
}

/**
 * The 9×9 grid. Omit `onSelect` for a display-only board (the table screen).
 * Clashing digits are worked out here from what is on screen — the answer is
 * never sent to the client, so the view could not reveal it if it tried.
 */
export function Grid(props: {
  view: SdView;
  big?: boolean;
  sel?: number | null;
  onSelect?: (i: number) => void;
}) {
  const { view } = props;
  const bad = conflicts(view.digits);
  const sel = props.sel ?? null;
  const selDigit = sel === null ? 0 : (view.digits[sel] ?? 0);

  return (
    <div className={props.big ? 'sd-grid big' : 'sd-grid'}>
      {view.digits.map((digit, i) => {
        const given = view.givens[i] === true;
        const marks = view.marks[i] ?? 0;
        const classes = ['sd-cell'];
        if (given) classes.push('sd-given');
        if (sel !== null) {
          if (i === sel) classes.push('sd-sel');
          else if (rowOf(i) === rowOf(sel) || colOf(i) === colOf(sel) || boxOf(i) === boxOf(sel)) {
            classes.push('sd-peer');
          }
          if (digit !== 0 && digit === selDigit && i !== sel) classes.push('sd-same');
        }
        if (bad[i]) classes.push('sd-bad');
        // the 3×3 blocks are drawn with thicker cell borders, not extra boxes,
        // so the grid stays one CSS grid and never reflows
        if (colOf(i) % 3 === 0 && colOf(i) > 0) classes.push('sd-bl');
        if (rowOf(i) % 3 === 0 && rowOf(i) > 0) classes.push('sd-bt');
        return (
          <button
            key={i}
            className={classes.join(' ')}
            disabled={!props.onSelect}
            aria-label={`row ${rowOf(i) + 1} column ${colOf(i) + 1}`}
            onClick={() => props.onSelect?.(i)}
          >
            {digit !== 0 ? (
              <span className="sd-digit">{digit}</span>
            ) : marks !== 0 ? (
              <span className="sd-marks">
                {Array.from({ length: 9 }, (_, k) => (
                  <i key={k} className={(marks >> k) & 1 ? 'sd-mark on' : 'sd-mark'}>
                    {(marks >> k) & 1 ? k + 1 : ''}
                  </i>
                ))}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** 1–9 plus erase. A key with no cell selected simply does nothing. */
export function Pad(props: {
  counts: number[];
  pencil: boolean;
  disabled: boolean;
  onDigit: (d: number) => void;
  onErase: () => void;
  onPencil: () => void;
}) {
  return (
    <div className="sd-controls">
      <div className="sd-pad" role="group" aria-label="digits">
        {Array.from({ length: 9 }, (_, k) => k + 1).map((d) => (
          <button
            key={d}
            className={`sd-key${(props.counts[d] ?? 0) >= 9 ? ' sd-done' : ''}${props.pencil ? ' sd-pencilled' : ''}`}
            disabled={props.disabled}
            onClick={() => props.onDigit(d)}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="sd-tools">
        <button
          className={props.pencil ? 'sd-tool sd-on' : 'sd-tool'}
          disabled={props.disabled}
          onClick={props.onPencil}
          aria-pressed={props.pencil}
        >
          ✏️ notes {props.pencil ? 'on' : 'off'}
        </button>
        <button className="sd-tool" disabled={props.disabled} onClick={props.onErase}>
          ⌫ erase
        </button>
      </div>
    </div>
  );
}
