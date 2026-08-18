import '../shared/exposeReact.js';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLobby } from '../shared/useLobby.js';
import { DeviceTiles } from '../shared/LobbyBits.js';
import { GameScreen } from '../shared/GameScreen.js';
import { AVATARS, avatarFor } from '../../shared/avatar.js';

interface Profile {
  name: string;
  avatar: string;
}

function loadProfile(): Profile | null {
  const name = localStorage.getItem('uge:name');
  if (!name) return null;
  return { name, avatar: localStorage.getItem('uge:avatar') ?? avatarFor(name) };
}

function ProfileEditor(props: { initial: Profile | null; onSave: (p: Profile) => void }) {
  const [name, setName] = useState(props.initial?.name ?? '');
  const [picked, setPicked] = useState<string | null>(props.initial?.avatar ?? null);
  const avatar = picked ?? (name.trim() ? avatarFor(name.trim()) : '👋');
  const save = () => name.trim() && props.onSave({ name: name.trim(), avatar });
  return (
    <div className="center-screen editor">
      <div className="stack">
        <div className="big-avatar">{avatar}</div>
        <h1>UGE</h1>
        <p className="muted">{props.initial ? 'Change your name & look' : 'You reached the table. Who are you?'}</p>
        <input
          autoFocus={!props.initial}
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
              className={a === avatar ? 'avatar-pick on' : 'avatar-pick'}
              onClick={() => setPicked(a)}
            >
              {a}
            </button>
          ))}
        </div>
        <button className="primary" disabled={!name.trim()} onClick={save}>
          {props.initial ? 'Save' : 'Join the lobby'}
        </button>
      </div>
    </div>
  );
}

function PhoneLobby(props: { profile: Profile; onChange: (p: Profile) => void }) {
  const { profile } = props;
  const [editing, setEditing] = useState(false);
  const { snapshot, deviceId, offline, act } = useLobby({
    name: profile.name,
    avatar: profile.avatar,
    isTableScreen: false,
  });

  const editorOverlay = editing && (
    <div className="overlay">
      <ProfileEditor
        initial={profile}
        onSave={(p) => {
          props.onChange(p);
          setEditing(false);
        }}
      />
    </div>
  );

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
      <>
        <GameScreen game={snapshot.game} move={(name, ...args) => act('/api/game/move', { name, args })} />
        <button className="profile-chip" onClick={() => setEditing(true)}>
          {profile.avatar}
        </button>
        {editorOverlay}
      </>
    );
  }

  return (
    <div className="phone">
      <header>
        <h1>UGE</h1>
        <a href="#" onClick={(e) => (e.preventDefault(), setEditing(true))}>
          {profile.avatar} {profile.name} · edit
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
            <strong>
              {selected.manifest.icon ?? '🎲'} {selected.manifest.name}
            </strong>{' '}
            <span className="muted">
              {selected.modes.filter((mo) => mo.offered).length > 1 && snapshot.selectedModeId
                ? `· ${selected.modes.find((mo) => mo.id === snapshot.selectedModeId)?.name ?? ''}`
                : `(${selected.manifest.players.min}–${selected.manifest.players.max} players)`}
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
                  ✅ You're in as <strong>{myRole === 'hand' ? 'player' : myRole.replace(/-/g, ' ')}</strong>
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
                  Become {extra.replace(/-/g, ' ')}
                </button>
              ))}
            {snapshot.blockers.length > 0 && <p className="blockers">{snapshot.blockers.join(' · ')}</p>}
            {snapshot.canStart && <p className="muted">Ready — start from the table screen.</p>}
          </div>
        </>
      )}
      {editorOverlay}
    </div>
  );
}

function App() {
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const save = (p: Profile) => {
    localStorage.setItem('uge:name', p.name);
    localStorage.setItem('uge:avatar', p.avatar);
    setProfile(p);
  };
  if (!profile) return <ProfileEditor initial={null} onSave={save} />;
  return <PhoneLobby profile={profile} onChange={save} />;
}

createRoot(document.getElementById('root')!).render(<App />);
