import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLobby } from '../shared/useLobby.js';
import { DeviceTiles, GameList } from '../shared/LobbyBits.js';

function NameEntry(props: { onJoin: (name: string) => void }) {
  const [draft, setDraft] = useState('');
  const join = () => draft.trim() && props.onJoin(draft.trim());
  return (
    <div className="center-screen">
      <div className="stack">
        <div className="ok">✓</div>
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

  if (snapshot.phase === 'starting' && selected) {
    return (
      <div className="center-screen">
        <div className="stack">
          <h1>{selected.manifest.name}</h1>
          <p className="muted">Starting… the game engine lands in stage 3.</p>
          <button onClick={() => act('/api/lobby/reset')}>Back to lobby</button>
        </div>
      </div>
    );
  }

  const myRole = snapshot.devices.find((d) => d.id === deviceId)?.role ?? null;

  return (
    <div className="phone">
      <header>
        <h1>UGE</h1>
        <a href="#" onClick={(e) => (e.preventDefault(), props.onRename())}>
          {props.name} · rename
        </a>
      </header>
      {offline && <p className="offline">connection to the brain lost — retrying…</p>}

      <h2>At the table</h2>
      <DeviceTiles devices={snapshot.devices} myId={deviceId} />

      <h2>Games</h2>
      <GameList
        games={snapshot.games}
        selectedGameId={snapshot.selectedGameId}
        onSelect={(gameId) => act('/api/lobby/select', { gameId })}
      />

      {selected && (
        <>
          <h2>Your role</h2>
          <div className="actions">
            {myRole === null ? (
              <>
                {selected.manifest.roles.hand !== 'none' && (
                  <button className="primary" onClick={() => act('/api/lobby/claim', { deviceId, role: 'hand' })}>
                    Join as player
                  </button>
                )}
                {selected.manifest.roles.table !== 'none' && (
                  <button onClick={() => act('/api/lobby/claim', { deviceId, role: 'table' })}>
                    Use this device as the table
                  </button>
                )}
                {selected.manifest.roles.extras.map((extra) => (
                  <button key={extra} onClick={() => act('/api/lobby/claim', { deviceId, role: extra })}>
                    Claim: {extra}
                  </button>
                ))}
              </>
            ) : (
              <>
                <p>
                  You are: <strong>{myRole}</strong>
                </p>
                <button onClick={() => act('/api/lobby/claim', { deviceId, role: null })}>
                  Leave role
                </button>
              </>
            )}
          </div>

          <h2>Start</h2>
          <div className="actions">
            <button className="primary" disabled={!snapshot.canStart} onClick={() => act('/api/lobby/start')}>
              Start {selected.manifest.name}
            </button>
            {snapshot.blockers.length > 0 && (
              <p className="blockers">{snapshot.blockers.join(' · ')}</p>
            )}
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
