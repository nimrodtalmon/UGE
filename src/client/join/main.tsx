import '../shared/exposeReact.js';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLobby } from '../shared/useLobby.js';
import { DeviceTiles } from '../shared/LobbyBits.js';
import { GameScreen } from '../shared/GameScreen.js';
import { avatarFor } from '../../shared/avatar.js';

function NameEntry(props: { onJoin: (name: string) => void }) {
  const [draft, setDraft] = useState('');
  const join = () => draft.trim() && props.onJoin(draft.trim());
  return (
    <div className="center-screen">
      <div className="stack">
        <div className="ok big-avatar">{draft.trim() ? avatarFor(draft.trim()) : '👋'}</div>
        <h1>UGE</h1>
        <p className="muted">You reached the table. Who are you?</p>
        <input
          autoFocus
          placeholder="your name"
          value={draft}
          maxLength={20}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && join()}
        />
        <button className="primary" disabled={!draft.trim()} onClick={join}>
          Join the lobby
        </button>
      </div>
    </div>
  );
}

function PhoneLobby(props: { name: string; onRename: () => void }) {
  const { snapshot, deviceId, offline, act } = useLobby({ name: props.name, isTableScreen: false });

  if (!snapshot) {
    return (
      <div className="center-screen">
        <p className="muted">{offline ? 'looking for the brain…' : 'joining…'}</p>
      </div>
    );
  }

  const selected = snapshot.games.find((g) => g.manifest.id === snapshot.selectedGameId) ?? null;
  const myRole = snapshot.devices.find((d) => d.id === deviceId)?.role ?? null;

  if (snapshot.phase === 'playing' && snapshot.game) {
    return (
      <GameScreen game={snapshot.game} move={(name, ...args) => act('/api/game/move', { name, args })} />
    );
  }

  return (
    <div className="phone">
      <header>
        <h1>UGE</h1>
        <a href="#" onClick={(e) => (e.preventDefault(), props.onRename())}>
          {avatarFor(props.name)} {props.name} · rename
        </a>
      </header>
      {offline && <p className="offline">connection to the brain lost — retrying…</p>}

      <h2>At the table</h2>
      <DeviceTiles devices={snapshot.devices} myId={deviceId} />

      <h2>Game</h2>
      {selected === null ? (
        <p className="muted">Waiting for the table screen to pick a game…</p>
      ) : (
        <>
          <p>
            <strong>{selected.manifest.name}</strong>{' '}
            <span className="muted">
              ({selected.manifest.players.min}–{selected.manifest.players.max} players)
            </span>
          </p>
          <div className="actions">
            {myRole === null ? (
              <>
                <p className="muted">You're sitting this one out.</p>
                {selected.manifest.roles.hand !== 'none' && (
                  <button
                    className="primary"
                    onClick={() => act('/api/lobby/claim', { deviceId, role: 'hand' })}
                  >
                    Jump in
                  </button>
                )}
              </>
            ) : (
              <>
                <p>
                  ✅ You're in as <strong>{myRole === 'hand' ? 'player' : myRole}</strong>
                </p>
                <button onClick={() => act('/api/lobby/claim', { deviceId, role: null })}>
                  Sit out
                </button>
              </>
            )}
            {selected.manifest.roles.extras
              .filter((extra) => extra !== myRole)
              .map((extra) => (
                <button key={extra} onClick={() => act('/api/lobby/claim', { deviceId, role: extra })}>
                  Claim: {extra}
                </button>
              ))}
            {snapshot.blockers.length > 0 && <p className="blockers">{snapshot.blockers.join(' · ')}</p>}
            {snapshot.canStart && <p className="muted">Ready — start from the table screen.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function App() {
  const [name, setName] = useState<string | null>(localStorage.getItem('uge:name'));
  if (!name) {
    return (
      <NameEntry
        onJoin={(n) => {
          localStorage.setItem('uge:name', n);
          setName(n);
        }}
      />
    );
  }
  return (
    <PhoneLobby
      name={name}
      onRename={() => {
        localStorage.removeItem('uge:name');
        setName(null);
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(<App />);
