import type { DeviceTile, GameEntry } from '../../shared/types.js';

export function DeviceTiles(props: { devices: DeviceTile[]; myId: string | null }) {
  return (
    <div className="tiles">
      {props.devices.map((d) => (
        <div
          key={d.id}
          className={['tile', d.id === props.myId && 'me', d.away && 'away'].filter(Boolean).join(' ')}
        >
          <span className="avatar">{d.avatar}</span>
          <span className="who">
            {d.name}
            {d.away ? ' 💤' : ''}
          </span>
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
  return (
    <div className="games">
      {props.games.map(({ manifest, feasible, reason }) => {
        const selected = manifest.id === props.selectedGameId;
        const classes = ['game', selected && 'selected', feasible ? 'ready' : 'infeasible'];
        return (
          <button
            key={manifest.id}
            className={classes.filter(Boolean).join(' ')}
            disabled={!props.onSelect}
            onClick={() => props.onSelect?.(selected ? null : manifest.id)}
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
      {props.games.length === 0 && <p className="muted">no games installed</p>}
    </div>
  );
}
