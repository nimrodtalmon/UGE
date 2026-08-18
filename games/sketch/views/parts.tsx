import type { CSSProperties } from 'react';
import { avatarFor, colorFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import type { SketchView } from '../game.js';

/** Render the accumulated strokes; scales to its container. */
export function Picture({ view, big }: { view: SketchView; big?: boolean }) {
  return (
    <svg className={big ? 'sk-picture big' : 'sk-picture'} viewBox="0 0 1000 1000">
      {view.strokes.map((s, i) => (
        <polyline
          key={i}
          points={Array.from({ length: s.p.length / 2 }, (_, j) => `${s.p[j * 2]},${s.p[j * 2 + 1]}`).join(' ')}
          fill="none"
          stroke={s.c}
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function Scores({ view, players }: { view: SketchView; players: PlayerInfo[] }) {
  return (
    <div className="sk-scores">
      {view.names.map((name, i) => (
        <div
          key={i}
          className={[
            'sk-player',
            view.phase !== 'done' && i === view.drawer && 'drawer',
            view.guessed.includes(i) && 'guessed',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ '--seat': colorFor(i) } as CSSProperties}
        >
          <span>{players[i]?.avatar ?? avatarFor(name)}</span>
          <span className="sk-name">{players[i]?.name ?? name}</span>
          {view.phase !== 'done' && i === view.drawer && <span className="sk-tag">🖌️</span>}
          {view.guessed.includes(i) && <span className="sk-tag">✓</span>}
          <strong>{view.scores[i]}</strong>
        </div>
      ))}
    </div>
  );
}
