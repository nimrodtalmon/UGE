import type { DialView } from '../game.js';

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function teamLabel(round: number): string {
  return round % 2 === 0 ? '🔴 Red' : '🔵 Blue';
}

export function revealText(view: DialView): string {
  return view.lastPoints > 0
    ? `+${view.lastPoints} for ${teamLabel(view.round)}!`
    : 'Way off — no points 😅';
}

export function TeamChips({ view, over }: { view: DialView; over: boolean }) {
  const team = view.round % 2;
  return (
    <div className="dl-chips">
      {['🔴 Red', '🔵 Blue'].map((label, i) => (
        <span
          key={i}
          className={!over && view.phase !== 'done' && i === team ? `dl-chip t${i} current` : `dl-chip t${i}`}
        >
          {label} <strong>{view.scores[i] ?? 0}</strong>
        </span>
      ))}
    </div>
  );
}

/**
 * The spectrum dial: gradient track between the two ends, optional scoring
 * bands + 🎯 mark around the target, and a needle at `needle` (0..100).
 */
export function DialBar({ view, needle, target = null }: {
  view: DialView;
  needle: number | null;
  target?: number | null;
}) {
  const bands = [
    [25, 'b2'],
    [12, 'b3'],
    [5, 'b4'],
  ] as const;
  return (
    <div className="dl-dial">
      <div className="dl-marks">
        {target !== null && (
          <span className="dl-target-mark" style={{ left: `${target}%` }}>
            🎯
          </span>
        )}
      </div>
      <div className="dl-track">
        {target !== null &&
          bands.map(([w, cls]) => (
            <div
              key={cls}
              className={`dl-band ${cls}`}
              style={{ left: `${clamp(target - w)}%`, width: `${clamp(target + w) - clamp(target - w)}%` }}
            />
          ))}
        {needle !== null && <div className="dl-needle" style={{ left: `${needle}%` }} />}
      </div>
      <div className="dl-labels">
        <span className="dl-label">◀ {view.spectrum?.left ?? '…'}</span>
        <span className="dl-label">{view.spectrum?.right ?? '…'} ▶</span>
      </div>
    </div>
  );
}
