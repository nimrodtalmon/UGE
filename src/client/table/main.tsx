import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLobby } from '../shared/useLobby.js';
import { DeviceTiles, GameList } from '../shared/LobbyBits.js';

function Table() {
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const { snapshot, deviceId } = useLobby({ name: 'Table', isTableScreen: true });

  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then((s: { joinUrl: string }) => setJoinUrl(s.joinUrl));
  }, []);

  const selected = snapshot?.games.find((g) => g.manifest.id === snapshot.selectedGameId) ?? null;

  return (
    <div className="table-screen">
      <div className="qr">
        <h1>UGE</h1>
        <p className="muted">Scan to join from your phone</p>
        {joinUrl && (
          <>
            <img src="/api/qr.svg" alt={`Join QR for ${joinUrl}`} />
            <code>{joinUrl}</code>
          </>
        )}
      </div>

      <div>
        <h2>At the table</h2>
        <DeviceTiles devices={snapshot?.devices ?? []} myId={deviceId} />

        <h2>Games</h2>
        <GameList games={snapshot?.games ?? []} selectedGameId={snapshot?.selectedGameId ?? null} />

        {snapshot?.phase === 'starting' && selected && (
          <p className="starting-banner">
            {selected.manifest.name} — starting… <span className="muted">(engine lands in stage 3)</span>
          </p>
        )}
        {snapshot?.phase === 'lobby' && selected && snapshot.blockers.length > 0 && (
          <p className="blockers">{snapshot.blockers.join(' · ')}</p>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Table />);
