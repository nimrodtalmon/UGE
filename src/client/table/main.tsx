import '../shared/exposeReact.js';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLobby } from '../shared/useLobby.js';
import { DeviceTiles, GameList } from '../shared/LobbyBits.js';
import { GameScreen } from '../shared/GameScreen.js';
import type { GroupSetup } from '../../shared/types.js';

function Stepper(props: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button onClick={() => props.onChange(Math.max(props.min, props.value - 1))}>−</button>
      <strong>{props.value}</strong>
      <button onClick={() => props.onChange(Math.min(props.max, props.value + 1))}>+</button>
    </div>
  );
}

function SetupWizard(props: { initial: GroupSetup | null; onDone: (s: GroupSetup) => void }) {
  const [players, setPlayers] = useState(props.initial?.players ?? 4);
  // phones follow players until touched
  const [phones, setPhones] = useState<number | null>(props.initial ? props.initial.phones : null);
  const shownPhones = phones ?? players;
  return (
    <div className="center-screen">
      <div className="stack setup">
        <h1>UGE</h1>
        <p className="muted">Who's playing tonight?</p>
        <div className="stepper-row st-players">
          <span>Players</span>
          <Stepper value={players} min={1} max={12} onChange={setPlayers} />
        </div>
        <div className="stepper-row st-phones">
          <span>Phones</span>
          <Stepper value={shownPhones} min={0} max={12} onChange={setPhones} />
        </div>
        <p className="muted setup-hint">
          phones = devices people play on · count this one if it plays too
        </p>
        <button
          className="primary"
          onClick={() => props.onDone({ players, phones: shownPhones })}
        >
          Continue
        </button>
        <a className="join-here" href="/join" target="_blank" rel="noopener">
          open a player on this device →
        </a>
      </div>
    </div>
  );
}

function Table() {
  const [session, setSession] = useState<{
    joinUrl: string;
    version: string;
    wifi: { ssid: string } | null;
  } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editingSetup, setEditingSetup] = useState(false);
  const { snapshot, deviceId, act } = useLobby({ name: 'Table', isTableScreen: true });

  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then(setSession);
  }, []);

  async function update() {
    setUpdating(true);
    await fetch('/api/admin/update', { method: 'POST' }).catch(() => {});
    // give the server time to exit, then reload as soon as it's back
    setTimeout(() => {
      const poll = setInterval(async () => {
        try {
          const r = await fetch('/api/session');
          if (r.ok) {
            clearInterval(poll);
            location.reload();
          }
        } catch {
          /* still restarting */
        }
      }, 2000);
    }, 5000);
  }

  if (updating) {
    return (
      <div className="center-screen">
        <div className="stack">
          <h1>UGE</h1>
          <p className="muted">Updating… this screen reloads by itself when the brain is back.</p>
        </div>
      </div>
    );
  }

  if (snapshot?.phase === 'playing' && snapshot.game) {
    return (
      <div className="game-shell">
        <GameScreen game={snapshot.game} move={(name, ...args) => act('/api/game/move', { name, args })} />
        <div className="game-controls">
          {snapshot.game.over && (
            <button className="small primary" onClick={() => act('/api/lobby/start')}>
              Play again
            </button>
          )}
          <button className="small" onClick={() => act('/api/lobby/reset')}>
            End game
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="center-screen">
        <p className="muted">starting the table…</p>
      </div>
    );
  }

  // game-night setup comes first (and can be reopened via "change")
  if (snapshot.setup === null || editingSetup) {
    return (
      <SetupWizard
        initial={snapshot.setup}
        onDone={(s) => {
          void act('/api/lobby/setup', s);
          setEditingSetup(false);
        }}
      />
    );
  }

  const selected = snapshot.games.find((g) => g.manifest.id === snapshot.selectedGameId) ?? null;
  const joinedPhones = snapshot.devices.filter((d) => !d.isTableScreen).length;

  return (
    <div className="table-screen">
      <div className="qr">
        <h1>UGE</h1>
        {session?.wifi && (
          <div className="wifi-step">
            <p className="muted">1 · join WiFi “{session.wifi.ssid}”</p>
            <img className="wifi-qr" src="/api/wifi-qr.svg" alt={`WiFi QR for ${session.wifi.ssid}`} />
          </div>
        )}
        <p className="muted">{session?.wifi ? '2 · scan to join the table' : 'Scan to join the table'}</p>
        {session && (
          <>
            <a href="/join" target="_blank" rel="noopener">
              <img src="/api/qr.svg" alt={`Join QR for ${session.joinUrl}`} />
            </a>
            <a className="join-url" href="/join" target="_blank" rel="noopener">
              <code>{session.joinUrl}</code>
            </a>
            <p className={joinedPhones >= snapshot.setup.phones ? 'join-count done' : 'join-count'}>
              {joinedPhones} / {snapshot.setup.phones} phones joined
            </p>
            <a className="join-here" href="/join" target="_blank" rel="noopener">
              …or play on this device too →
            </a>
          </>
        )}
        <footer>
          <span className="muted">v {session?.version ?? '…'}</span>
          <button className="small" onClick={update}>Update</button>
        </footer>
      </div>

      <div className="lobby-main">
        <p className="setup-line">
          {snapshot.setup.players} player{snapshot.setup.players === 1 ? '' : 's'} ·{' '}
          {snapshot.setup.phones} phone{snapshot.setup.phones === 1 ? '' : 's'}{' '}
          <a
            href="#"
            onClick={(e) => (e.preventDefault(), setEditingSetup(true))}
          >
            change
          </a>
        </p>

        <h2>At the table</h2>
        <DeviceTiles devices={snapshot.devices} myId={deviceId} />

        <h2>Pick a game</h2>
        <GameList
          games={snapshot.games}
          selectedGameId={snapshot.selectedGameId}
          onSelect={(gameId) => act('/api/lobby/select', { gameId })}
          fitChip
        />
        {/* only genuine choices appear — the table auto-picks the mode that
            best uses the group's devices */}
        {selected && selected.modes.filter((mo) => mo.offered).length > 1 && (
          <div className="mode-row">
            {selected.modes
              .filter((mo) => mo.offered)
              .map((mo) => (
                <button
                  key={mo.id}
                  className={['mode', snapshot.selectedModeId === mo.id && 'on'].filter(Boolean).join(' ')}
                  onClick={() => act('/api/lobby/mode', { modeId: mo.id })}
                >
                  <strong>{mo.name}</strong>
                  <span className="meta">{mo.tagline ?? ''}</span>
                </button>
              ))}
          </div>
        )}
        <div className="actions start-row">
          {selected && (
            <button
              className="primary big-start"
              disabled={!snapshot.canStart}
              onClick={() => act('/api/lobby/start')}
            >
              ▶ Start {selected.manifest.name}
            </button>
          )}
          {selected && snapshot.blockers.length > 0 && (
            <p className="blockers">{snapshot.blockers.join(' · ')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Table />);
