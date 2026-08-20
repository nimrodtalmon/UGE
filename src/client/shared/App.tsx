import { useEffect, useState } from 'react';
import { useLobby } from './useLobby.js';
import { api, roomBase } from './room.js';
import { Celebration, DeviceTiles, GameList } from './LobbyBits.js';
import { GameScreen } from './GameScreen.js';
import { AVATARS, avatarFor, randomIdentity } from '../../shared/avatar.js';

/**
 * One app for every device. You land ready to play as yourself; the room
 * panel is where you add people (QR), hand this screen the table role, or
 * say how many of you share this device. Nothing is declared up front.
 */

export interface Profile {
  name: string;
  avatar: string;
}

interface Session {
  joinUrl: string;
  version: string;
  wifi: { ssid: string } | null;
  updatable?: boolean;
  roomCode?: string | null;
}

function loadProfile(host: boolean): Profile {
  const nameKey = host ? 'uge:table-name' : 'uge:name';
  const avatarKey = host ? 'uge:table-avatar' : 'uge:avatar';
  const name = localStorage.getItem(nameKey);
  if (name) return { name, avatar: localStorage.getItem(avatarKey) ?? avatarFor(name) };
  const fresh = randomIdentity();
  localStorage.setItem(nameKey, fresh.name);
  localStorage.setItem(avatarKey, fresh.avatar);
  return fresh;
}

function ProfileEditor(props: { initial: Profile; onSave: (p: Profile) => void; onClose: () => void }) {
  const [name, setName] = useState(props.initial.name);
  const [picked, setPicked] = useState(props.initial.avatar);
  const save = () => name.trim() && props.onSave({ name: name.trim(), avatar: picked });
  return (
    <div className="center-screen editor">
      <div className="stack">
        <div className="big-avatar">{picked}</div>
        <h1>UGE</h1>
        <p className="muted">Your name & look</p>
        <input
          placeholder="your name"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={a === picked ? 'avatar-pick on' : 'avatar-pick'}
              onClick={() => setPicked(a)}
            >
              {a}
            </button>
          ))}
        </div>
        <button className="primary" disabled={!name.trim()} onClick={save}>
          Save
        </button>
        <button className="small" onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The room panel: add people, hand over the table role, share a device. */
function RoomPanel(props: {
  session: Session | null;
  meSeats: number;
  meIsTable: boolean;
  phones: number;
  onSeats: (n: number) => void;
  onTable: (on: boolean) => void;
  onUpdate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay room-panel">
      <div className="room-inner">
        <button className="room-close" onClick={props.onClose}>
          ✕
        </button>
        <h2 className="room-h">Add people</h2>
        {props.session?.roomCode && (
          <p className="room-code">
            room <strong>{props.session.roomCode}</strong>{' '}
            <a className="room-switch" href="/">
              ⇄ switch
            </a>
          </p>
        )}
        {props.session?.wifi && (
          <div className="wifi-step">
            <p className="muted">1 · join WiFi “{props.session.wifi.ssid}”</p>
            <img className="wifi-qr" src={api('/api/wifi-qr.svg')} alt={`WiFi QR for ${props.session.wifi.ssid}`} />
          </div>
        )}
        <p className="muted">{props.session?.wifi ? '2 · scan to join' : 'Scan to join on another phone'}</p>
        <a href={`${roomBase}/join`} target="_blank" rel="noopener">
          <img className="room-qr" src={api('/api/qr.svg')} alt="Join QR" />
        </a>
        <a className="join-url" href={`${roomBase}/join`} target="_blank" rel="noopener">
          <code>{props.session?.joinUrl ?? '…'}</code>
        </a>

        <h2 className="room-h">This screen</h2>
        <button
          className={props.meIsTable ? 'toggle on wide' : 'toggle wide'}
          onClick={() => props.onTable(!props.meIsTable)}
        >
          {props.meIsTable ? '🖥️ acting as the table' : '📺 use as the table screen'}
        </button>
        <p className="muted setup-hint">
          the table shows the shared board for everyone — it doesn't hold a seat
        </p>

        {!props.meIsTable && (
          <>
            <h2 className="room-h">Playing on this device</h2>
            <div className="stepper-row">
              <span>{props.meSeats === 1 ? 'just me' : `${props.meSeats} of us`}</span>
              <div className="stepper">
                <button onClick={() => props.onSeats(Math.max(1, props.meSeats - 1))}>−</button>
                <strong>{props.meSeats}</strong>
                <button onClick={() => props.onSeats(Math.min(12, props.meSeats + 1))}>+</button>
              </div>
            </div>
            <p className="muted setup-hint">
              more than one? games that pass a single phone around become available
            </p>
          </>
        )}

        <footer className="room-foot">
          <span className="muted">v {props.session?.version ?? '…'}</span>
          {props.session?.updatable !== false && (
            <button className="small" onClick={props.onUpdate}>
              Update
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export function App({ host = false }: { host?: boolean }) {
  const [profile, setProfile] = useState<Profile>(() => loadProfile(host));
  const [session, setSession] = useState<Session | null>(null);
  const [panel, setPanel] = useState<null | 'room' | 'profile'>(null);
  const [updating, setUpdating] = useState(false);
  const { snapshot, deviceId, offline, act } = useLobby({ ...profile, host });

  useEffect(() => {
    fetch(api('/api/session'))
      .then((r) => r.json())
      .then(setSession)
      .catch(() => {});
  }, []);

  const saveProfile = (p: Profile) => {
    localStorage.setItem(host ? 'uge:table-name' : 'uge:name', p.name);
    localStorage.setItem(host ? 'uge:table-avatar' : 'uge:avatar', p.avatar);
    setProfile(p);
    setPanel(null);
  };

  async function update() {
    setUpdating(true);
    await fetch(api('/api/admin/update'), { method: 'POST' }).catch(() => {});
    setTimeout(() => {
      const poll = setInterval(async () => {
        try {
          const r = await fetch(api('/api/session'));
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

  if (!snapshot) {
    return (
      <div className="center-screen">
        <p className="muted">{offline ? 'looking for the brain…' : 'starting UGE…'}</p>
      </div>
    );
  }

  const me = snapshot.me;
  const iAmTable = me?.isTable === true;
  const overlay =
    panel === 'profile' ? (
      <div className="overlay">
        <ProfileEditor initial={profile} onSave={saveProfile} onClose={() => setPanel(null)} />
      </div>
    ) : panel === 'room' ? (
      <RoomPanel
        session={session}
        meSeats={me?.seats ?? 1}
        meIsTable={iAmTable}
        phones={snapshot.setup.phones}
        onSeats={(n) => act('/api/lobby/seats', { seats: n })}
        onTable={(on) => act('/api/lobby/table', { on })}
        onUpdate={update}
        onClose={() => setPanel(null)}
      />
    ) : null;

  // ---- a game is running
  if (snapshot.phase === 'playing' && snapshot.game) {
    // the table drives the game controls; with no table screen, everyone gets them
    const showControls = iAmTable || !snapshot.setup.hasTable;
    return (
      <>
        {offline && <p className="table-offline">connection lost — reconnecting…</p>}
        <div className="game-viewport">
          <GameScreen game={snapshot.game} move={(name, ...args) => act('/api/game/move', { name, args })} />
        </div>
        {snapshot.game.over && iAmTable && <Celebration />}
        {!iAmTable && (
          <button className="profile-chip" onClick={() => setPanel('profile')}>
            {profile.avatar}
          </button>
        )}
        {showControls && (
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
        )}
        {overlay}
      </>
    );
  }

  // ---- home / lobby
  const selected = snapshot.games.find((g) => g.manifest.id === snapshot.selectedGameId) ?? null;
  const { players, phones, hasTable } = snapshot.setup;
  const suggestTable =
    host && !iAmTable && !hasTable && phones >= 2 && typeof window !== 'undefined' && window.innerWidth >= 900;

  return (
    <div className="home">
      <header className="home-bar">
        <h1>UGE</h1>
        <div className="home-actions">
          {session?.roomCode && (
            <span className="chip room-chip">
              room <strong>{session.roomCode}</strong>
            </span>
          )}
          {!iAmTable && (
            <button className="chip" onClick={() => setPanel('profile')}>
              {profile.avatar} {profile.name}
            </button>
          )}
          {iAmTable && <span className="chip table-chip">🖥️ table screen</span>}
          <button className="chip primary" onClick={() => setPanel('room')}>
            ＋ Add people
          </button>
        </div>
      </header>

      {offline && <p className="offline">connection lost — retrying…</p>}

      <p className="setup-line">
        {players} player{players === 1 ? '' : 's'} · {phones} device{phones === 1 ? '' : 's'}
        {hasTable ? ' · table screen' : ''}{' '}
        <a href="#" onClick={(e) => (e.preventDefault(), setPanel('room'))}>
          change
        </a>
      </p>

      {suggestTable && (
        <button className="table-suggest" onClick={() => act('/api/lobby/table', { on: true })}>
          📺 use this big screen as the table?
        </button>
      )}

      <h2>Who's here</h2>
      <DeviceTiles devices={snapshot.devices} myId={deviceId} />

      <h2>Pick a game</h2>
      <GameList
        games={snapshot.games}
        selectedGameId={snapshot.selectedGameId}
        onSelect={(gameId) => act('/api/lobby/select', { gameId })}
        fitChip
      />
      {/* only genuine choices appear — the lobby auto-picks the mode that
          best uses the devices that are actually here */}
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

      {/* your own seat: extra roles (spymasters…), or sitting this one out */}
      {selected && !iAmTable && me && (
        <div className="role-row">
          {selected.manifest.roles.extras
            .filter((extra) => extra !== me.role)
            .map((extra) => (
              <button key={extra} className="chip" onClick={() => act('/api/lobby/claim', { role: extra })}>
                Become {extra.replace(/-/g, ' ')}
              </button>
            ))}
          {me.role === null ? (
            <button className="chip" onClick={() => act('/api/lobby/claim', { role: 'hand' })}>
              Jump in
            </button>
          ) : (
            <button className="chip" onClick={() => act('/api/lobby/claim', { role: null })}>
              {me.role === 'hand' ? 'Sit out' : `Stop being ${me.role.replace(/-/g, ' ')}`}
            </button>
          )}
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
        {!selected && <p className="muted">pick a game to start</p>}
      </div>
      {overlay}
    </div>
  );
}
