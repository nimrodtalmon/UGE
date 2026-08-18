import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLobby } from '../shared/useLobby.js';
import { DeviceTiles, GameList } from '../shared/LobbyBits.js';

function Table() {
  const [session, setSession] = useState<{ joinUrl: string; version: string } | null>(null);
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

  const selected = snapshot?.games.find((g) => g.manifest.id === snapshot.selectedGameId) ?? null;

  return (
    <div className="table-screen">
      <div className="qr">
        <h1>UGE</h1>
        <p className="muted">Scan to join from your phone</p>
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

      <div>
        <h2>At the table</h2>
        <DeviceTiles devices={snapshot?.devices ?? []} myId={deviceId} />

        {snapshot?.phase === 'starting' && selected ? (
          <>
            <p className="starting-banner">
              {selected.manifest.name} — starting…{' '}
              <span className="muted">(engine lands in stage 3)</span>
            </p>
            <div className="actions">
              <button onClick={() => act('/api/lobby/reset')}>Back to lobby</button>
            </div>
          </>
        ) : (
          <>
            <h2>Pick a game</h2>
            <GameList
              games={snapshot?.games ?? []}
              selectedGameId={snapshot?.selectedGameId ?? null}
              onSelect={(gameId) => act('/api/lobby/select', { gameId })}
            />
            {selected && (
              <div className="actions">
                <button
                  className="primary"
                  disabled={!snapshot?.canStart}
                  onClick={() => act('/api/lobby/start')}
                >
                  Start {selected.manifest.name}
                </button>
                {snapshot && snapshot.blockers.length > 0 && (
                  <p className="blockers">{snapshot.blockers.join(' · ')}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Table />);
