import '../shared/exposeReact.js';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLobby } from '../shared/useLobby.js';
import { DeviceTiles, GameList } from '../shared/LobbyBits.js';
import { GameScreen } from '../shared/GameScreen.js';

function Table() {
  const [session, setSession] = useState<{
    joinUrl: string;
    version: string;
    wifi: { ssid: string } | null;
  } | null>(null);
  const [updating, setUpdating] = useState(false);
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

  const selected = snapshot?.games.find((g) => g.manifest.id === snapshot.selectedGameId) ?? null;

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
            <img src="/api/qr.svg" alt={`Join QR for ${session.joinUrl}`} />
            <code>{session.joinUrl}</code>
          </>
        )}
        <footer>
          <span className="muted">v {session?.version ?? '…'}</span>
          <button className="small" onClick={update}>Update</button>
        </footer>
      </div>

      <div className="lobby-main">
        <h2>At the table</h2>
        <DeviceTiles devices={snapshot?.devices ?? []} myId={deviceId} />

        <h2>Pick a game</h2>
        <GameList
          games={snapshot?.games ?? []}
          selectedGameId={snapshot?.selectedGameId ?? null}
          onSelect={(gameId) => act('/api/lobby/select', { gameId })}
        />
        <div className="actions start-row">
          {selected && (
            <button
              className="primary big-start"
              disabled={!snapshot?.canStart}
              onClick={() => act('/api/lobby/start')}
            >
              ▶ Start {selected.manifest.name}
            </button>
          )}
          {selected && snapshot && snapshot.blockers.length > 0 && (
            <p className="blockers">{snapshot.blockers.join(' · ')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Table />);
