import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { hueOf } from '../../shared/avatar.js';
import type { DeviceTile, GameEntry } from '../../shared/types.js';

export function DeviceTiles(props: { devices: DeviceTile[]; myId: string | null }) {
  return (
    <div className="tiles">
      {props.devices.map((d) => (
        <div
          key={d.id}
          className={['tile', d.id === props.myId && 'me', d.away && 'away'].filter(Boolean).join(' ')}
          style={{ '--seat': `hsl(${hueOf(d.name)} 55% 52%)` } as CSSProperties}
        >
          <span className="avatar">{d.avatar}</span>
          <span className="who">
            {d.name}
            {d.away ? ' 💤' : ''}
          </span>
          {d.seats > 1 && !d.isTable && <span className="badge seats">{d.seats} here</span>}
          {d.role && <span className={`badge ${d.role === 'table' ? 'table' : ''}`}>{d.role === 'hand' ? 'player' : d.role}</span>}
        </div>
      ))}
      {props.devices.length === 0 && <p className="muted">nobody yet</p>}
    </div>
  );
}

export function GameList(props: {
  games: GameEntry[];
  selectedGameId: string | null;
  onSelect?: (gameId: string | null) => void;
  /** Feasibility is against the declared group ("fits") rather than joined devices ("ready"). */
  fitChip?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  // with a declared group, non-fitting games hide behind an expander
  const hidden = props.fitChip && !showAll ? props.games.filter((g) => !g.feasible) : [];
  const shown = props.games.filter((g) => !hidden.includes(g));
  return (
    <div className="games">
      {shown.map(({ manifest, feasible, reason }) => {
        const selected = manifest.id === props.selectedGameId;
        const classes = ['game', selected && 'selected', feasible ? 'ready' : 'infeasible'];
        return (
          <button
            key={manifest.id}
            className={classes.filter(Boolean).join(' ')}
            disabled={!props.onSelect}
            onClick={() => props.onSelect?.(selected ? null : manifest.id)}
            style={
              {
                '--hue': hueOf(manifest.id),
                '--accent': `hsl(${hueOf(manifest.id)} 55% 55%)`,
              } as CSSProperties
            }
          >
            <span className="game-icon">{manifest.icon ?? '🎲'}</span>
            <span className="game-name">{manifest.name}</span>
            <span className="game-tagline">{manifest.tagline ?? ''}</span>
            <span className="meta">
              {manifest.players.min === manifest.players.max
                ? `${manifest.players.min} player${manifest.players.min === 1 ? '' : 's'}`
                : `${manifest.players.min}–${manifest.players.max} players`}
            </span>
            {feasible ? (
              <span className="ready-chip">
                {selected ? 'selected' : props.fitChip ? 'fits your group' : 'ready'}
              </span>
            ) : (
              <span className="meta reason">{reason}</span>
            )}
          </button>
        );
      })}
      {hidden.length > 0 && (
        <button className="games-more" onClick={() => setShowAll(true)}>
          +{hidden.length} more game{hidden.length === 1 ? '' : 's'}
          <span className="meta">add people to unlock</span>
        </button>
      )}
      {props.games.length === 0 && <p className="muted">no games installed</p>}
    </div>
  );
}

const CONFETTI = ['🎉', '✨', '🎊', '⭐', '💚', '🧡'];

/** Falling-emoji celebration for finished games — platform-wide, table screen. */
export function Celebration() {
  const bits = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => ({
        left: (i * 37 + 11) % 100,
        delay: (i % 8) * 0.33,
        char: CONFETTI[i % CONFETTI.length]!,
      })),
    [],
  );
  return (
    <div className="celebrate" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s` }}>
          {b.char}
        </span>
      ))}
    </div>
  );
}
