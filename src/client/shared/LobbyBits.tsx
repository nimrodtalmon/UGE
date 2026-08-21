import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { hueOf } from '../../shared/avatar.js';
import type { DeviceTile, GameEntry, Manifest } from '../../shared/types.js';

/** Everyone in the room, as a row of avatar bubbles. */
export function PeopleStrip(props: { devices: DeviceTile[]; myId: string | null }) {
  if (props.devices.length === 0) return <p className="muted">nobody here yet</p>;
  return (
    <div className="people">
      {props.devices.map((d) => (
        <div
          key={d.id}
          className={['person', 'tile', d.id === props.myId && 'me', d.away && 'away', d.bot && 'is-bot']
            .filter(Boolean)
            .join(' ')}
          style={{ '--seat': `hsl(${hueOf(d.name)} 60% 55%)` } as CSSProperties}
        >
          <span className="bubble">
            {d.avatar}
            {d.isTable && <span className="mark table">🖥</span>}
            {d.seats > 1 && !d.isTable && <span className="mark seats">{d.seats}</span>}
          </span>
          <span className="who">{d.name}</span>
        </div>
      ))}
    </div>
  );
}

export type GameFilter = 'ready' | 'solo' | 'party' | 'all';

const MATCH: Record<GameFilter, (g: GameEntry) => boolean> = {
  ready: (g) => g.feasible,
  solo: (g) => g.manifest.players.min === 1,
  party: (g) => g.manifest.players.max >= 6,
  all: () => true,
};

export function filterGames(games: GameEntry[], f: GameFilter): GameEntry[] {
  // Alphabetical, always. Sorting by feasibility looks tidier but reshuffles
  // the grid whenever the group changes — including under the finger that is
  // reaching for a card. A fixed order is worth more than a tidy one.
  return games
    .filter(MATCH[f])
    .slice()
    .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export function Segmented(props: {
  value: GameFilter;
  onChange: (f: GameFilter) => void;
  counts: Record<GameFilter, number>;
}) {
  const tabs: { id: GameFilter; label: string }[] = [
    { id: 'ready', label: 'Ready' },
    { id: 'solo', label: 'Solo' },
    { id: 'party', label: 'Party' },
    { id: 'all', label: 'All' },
  ];
  return (
    <div className="segmented" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          className={props.value === t.id ? 'seg on' : 'seg'}
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
          <span className="seg-n">{props.counts[t.id]}</span>
        </button>
      ))}
    </div>
  );
}

export function GameGrid(props: {
  games: GameEntry[];
  selectedGameId: string | null;
  onSelect: (gameId: string | null) => void;
}) {
  if (props.games.length === 0) {
    return <p className="empty-note">nothing here — try another tab, or add people</p>;
  }
  return (
    <div className="games">
      {props.games.map(({ manifest, feasible, reason, viaBots }) => {
        const selected = manifest.id === props.selectedGameId;
        const hue = hueOf(manifest.id);
        return (
          <button
            key={manifest.id}
            className={['game', selected && 'selected', feasible ? 'ready' : 'locked'].filter(Boolean).join(' ')}
            style={{ '--hue': hue } as CSSProperties}
            onClick={() => props.onSelect(selected ? null : manifest.id)}
          >
            <span className="game-icon">{manifest.icon ?? '🎲'}</span>
            <span className="game-name">{manifest.name}</span>
            <span className="game-tagline">{manifest.tagline ?? ''}</span>
            <span className="game-foot">
              {feasible && viaBots ? (
                <span className="meta bot-hint">🤖 vs AI</span>
              ) : feasible ? (
                <span className="meta">
                  {manifest.players.min === manifest.players.max
                    ? `${manifest.players.min}p`
                    : `${manifest.players.min}–${manifest.players.max}p`}
                </span>
              ) : (
                <span className="meta reason">🔒 {reason}</span>
              )}
            </span>
            {selected && <span className="game-check">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bottom sheet — the one modal shape used everywhere. `full` fills the screen
 * instead, for content you sit and read (how to play).
 */
export function Sheet(props: {
  title: string;
  onClose: () => void;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={props.full ? 'sheet-scrim full' : 'sheet-scrim'} onClick={props.onClose}>
      <div className={props.full ? 'sheet full' : 'sheet'} onClick={(e) => e.stopPropagation()}>
        {!props.full && <span className="grabber" />}
        <header className="sheet-head">
          <h3>{props.title}</h3>
          <button className="sheet-close room-close" onClick={props.onClose} aria-label="close">
            ✕
          </button>
        </header>
        <div className="sheet-body room-inner">{props.children}</div>
      </div>
    </div>
  );
}

/** How to play, from the manifest — the same copy in the lobby and in-game. */
export function HelpSheet(props: { manifest: Manifest; onClose: () => void }) {
  const help = props.manifest.help;
  return (
    <Sheet title={`How to play ${props.manifest.name}`} onClose={props.onClose} full>
      {help ? (
        <div className="help">
          <p className="help-goal">{help.goal}</p>
          <ol className="help-steps">
            {help.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {help.notes && help.notes.length > 0 && (
            <ul className="help-notes">
              {help.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="muted">No instructions for this one yet.</p>
      )}
    </Sheet>
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
