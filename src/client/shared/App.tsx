import { useEffect, useState } from 'react';
import { useLobby } from './useLobby.js';
import { api, roomBase } from './room.js';
import {
  Celebration,
  GameGrid,
  HelpBody,
  HelpSheet,
  PeopleStrip,
  Segmented,
  Sheet,
  filterGames,
  type GameFilter,
} from './LobbyBits.js';
import { GameScreen } from './GameScreen.js';
import { AVATARS, avatarFor, randomIdentity } from '../../shared/avatar.js';
import type { DeviceTile, GameEntry, LobbySnapshot } from '../../shared/types.js';

/**
 * One app for every device. You land ready to play as yourself; sheets hold
 * everything else (invite, table role, shared device, your look). Nothing is
 * declared up front — the group is whoever is connected.
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

function ProfileSheet(props: { initial: Profile; onSave: (p: Profile) => void; onClose: () => void }) {
  const [name, setName] = useState(props.initial.name);
  const [picked, setPicked] = useState(props.initial.avatar);
  const save = () => name.trim() && props.onSave({ name: name.trim(), avatar: picked });
  return (
    <Sheet title="You" onClose={props.onClose}>
      <div className="big-avatar">{picked}</div>
      <input
        placeholder="your name"
        value={name}
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      <div className="avatar-grid">
        {AVATARS.map((a) => (
          <button key={a} className={a === picked ? 'avatar-pick on' : 'avatar-pick'} onClick={() => setPicked(a)}>
            {a}
          </button>
        ))}
      </div>
      <button className="primary wide" disabled={!name.trim()} onClick={save}>
        Save
      </button>
    </Sheet>
  );
}

/** Invite people, hand over the table role, share a device, switch room. */
function InviteSheet(props: {
  session: Session | null;
  meSeats: number;
  meIsTable: boolean;
  onSeats: (n: number) => void;
  onTable: (on: boolean) => void;
  onUpdate: () => void;
  onFeedback: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the QR and the text are both on screen anyway */
    }
  };
  return (
    <Sheet title="Invite & room" onClose={props.onClose}>
      {props.session?.wifi && (
        <div className="row wifi-step">
          <img className="wifi-qr" src={api('/api/wifi-qr.svg')} alt={`WiFi QR for ${props.session.wifi.ssid}`} />
          <div className="row-text">
            <strong>1 · join the WiFi</strong>
            <span className="muted">{props.session.wifi.ssid}</span>
          </div>
        </div>
      )}
      <a className="qr-card" href={`${roomBase}/join`} target="_blank" rel="noopener">
        <img src={api('/api/qr.svg')} alt="Join QR" />
        <span className="muted">{props.session?.wifi ? '2 · scan to join' : 'scan to join'}</span>
      </a>
      <button className="link-row" onClick={() => copy('url', props.session?.joinUrl ?? '')}>
        <code>{props.session?.joinUrl ?? '…'}</code>
        <span className="copy">{copied === 'url' ? '✓ copied' : 'copy'}</span>
      </button>

      {props.session?.roomCode && (
        <div className="room-row">
          <div className="room-code-big">
            <span className="muted">room</span>
            <strong>{props.session.roomCode}</strong>
          </div>
          <div className="room-acts">
            <button onClick={() => copy('code', props.session!.roomCode!)}>
              {copied === 'code' ? '✓' : 'copy'}
            </button>
            <a className="btn" href="/">
              switch room
            </a>
          </div>
        </div>
      )}

      <h4 className="sheet-h">This screen</h4>
      <button
        className={props.meIsTable ? 'switch on' : 'switch'}
        onClick={() => props.onTable(!props.meIsTable)}
      >
        <span className="switch-text">
          <strong>{props.meIsTable ? '🖥️ acting as the table' : '📺 use as the table screen'}</strong>
          <span className="muted">shows the shared board · holds no seat</span>
        </span>
        <span className="knob" />
      </button>

      {!props.meIsTable && (
        <>
          <h4 className="sheet-h">Playing on this device</h4>
          <div className="stepper-row">
            <span>{props.meSeats === 1 ? 'just me' : `${props.meSeats} of us`}</span>
            <div className="stepper">
              <button onClick={() => props.onSeats(Math.max(1, props.meSeats - 1))}>−</button>
              <strong>{props.meSeats}</strong>
              <button onClick={() => props.onSeats(Math.min(12, props.meSeats + 1))}>+</button>
            </div>
          </div>
          <p className="muted hint">more than one? pass-the-phone games unlock</p>
        </>
      )}

      <button className="link-row feedback-link" onClick={props.onFeedback}>
        <span>💬 Send feedback</span>
        <span className="copy">say it here</span>
      </button>

      <footer className="sheet-foot room-foot">
        <span className="muted">v {props.session?.version ?? '…'}</span>
        {props.session?.updatable !== false && (
          <button className="small" onClick={props.onUpdate}>
            Update
          </button>
        )}
      </footer>
    </Sheet>
  );
}

/** Say something about UGE; it lands on the brain's /feedback page. */
function FeedbackSheet(props: { name: string; game: string | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    await fetch(api('/api/feedback'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), from: props.name, game: props.game }),
    }).catch(() => {});
    setSent(true);
    setTimeout(props.onClose, 1200);
  };
  return (
    <Sheet title="Tell us what you think" onClose={props.onClose}>
      {sent ? (
        <p className="ok-note">Thanks — noted! 🙏</p>
      ) : (
        <>
          <textarea
            className="feedback-text"
            autoFocus
            rows={5}
            maxLength={2000}
            placeholder="what broke, what felt clunky, what you wish it did…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="muted hint">
            {props.game ? `sent along with: ${props.game}` : 'sent from the lobby'}
          </p>
          <button className="primary wide" disabled={!text.trim()} onClick={send}>
            Send feedback
          </button>
        </>
      )}
    </Sheet>
  );
}

/** Tap a game and this is what opens: what it is, who plays, and Start. */
function GameSheet(props: {
  entry: GameEntry;
  snapshot: LobbySnapshot;
  myRole: string | null;
  iAmTable: boolean;
  act: (path: string, body?: object) => Promise<void>;
  onClose: () => void;
}) {
  const { entry, snapshot, act } = props;
  const m = entry.manifest;
  const players = snapshot.setup.players;
  const modes = entry.modes.filter((mo) => mo.offered);
  const freeSeats = m.players.max - (players - snapshot.bots);
  return (
    <Sheet title={`${m.icon ?? '🎲'} ${m.name}`} onClose={props.onClose}>
      <p className="muted game-sheet-tag">{m.tagline ?? ''}</p>
      <p className="meta">
        {m.players.min === m.players.max
          ? `${m.players.min} player${m.players.min === 1 ? '' : 's'}`
          : `${m.players.min}–${m.players.max} players`}
        {' · '}
        {players} here
      </p>

      {modes.length > 1 && (
        <div className="mode-row sheet-modes">
          {modes.map((mo) => (
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

      {m.bots && (
        <div className="bot-row sheet-bots">
          {freeSeats <= 1 ? (
            <button
              className={snapshot.bots > 0 ? 'tick on' : 'tick'}
              onClick={() => act('/api/lobby/bots', { count: snapshot.bots > 0 ? 0 : 1 })}
            >
              <span className="box">{snapshot.bots > 0 ? '✓' : ''}</span>
              🤖 Play against the computer
            </button>
          ) : (
            <div className="bot-count">
              <span className="bot-label">🤖 AI opponents</span>
              <div className="stepper small">
                <button
                  disabled={snapshot.bots === 0}
                  onClick={() => act('/api/lobby/bots', { count: snapshot.bots - 1 })}
                >
                  −
                </button>
                <strong>{snapshot.bots}</strong>
                <button
                  disabled={players >= m.players.max}
                  onClick={() => act('/api/lobby/bots', { count: snapshot.bots + 1 })}
                >
                  +
                </button>
              </div>
            </div>
          )}
          {snapshot.bots > 0 && (
            <div className="bot-levels">
              {m.bots.levels.map((lv) => (
                <button
                  key={lv.id}
                  className={snapshot.botLevel === lv.id ? 'chip on' : 'chip'}
                  onClick={() => act('/api/lobby/bots', { count: snapshot.bots, level: lv.id })}
                >
                  {lv.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* your own seat: extra roles, or sitting this one out */}
      {!props.iAmTable && (
        <div className="role-row">
          {m.roles.extras
            .filter((extra) => extra !== props.myRole)
            .map((extra) => (
              <button key={extra} className="ghost" onClick={() => act('/api/lobby/claim', { role: extra })}>
                Become {extra.replace(/-/g, ' ')}
              </button>
            ))}
          {props.myRole === null ? (
            <button className="ghost" onClick={() => act('/api/lobby/claim', { role: 'hand' })}>
              Jump in
            </button>
          ) : (
            <button className="ghost" onClick={() => act('/api/lobby/claim', { role: null })}>
              {props.myRole === 'hand' ? 'Sit out' : `Stop being ${props.myRole.replace(/-/g, ' ')}`}
            </button>
          )}
        </div>
      )}

      <button
        className="primary wide big-start"
        disabled={!snapshot.canStart}
        onClick={() => {
          void act('/api/lobby/start');
          props.onClose(); // get out of the way of the board
        }}
      >
        ▶ Start {m.name}
      </button>
      <p className="blockers reserve">{snapshot.blockers.join(' · ')}</p>

      <h4 className="sheet-h">How to play</h4>
      <HelpBody manifest={m} />
    </Sheet>
  );
}

export function App({ host = false }: { host?: boolean }) {
  const [profile, setProfile] = useState<Profile>(() => loadProfile(host));
  const [session, setSession] = useState<Session | null>(null);
  const [sheet, setSheet] = useState<null | 'invite' | 'profile' | 'help' | 'feedback' | 'game'>(null);
  const [person, setPerson] = useState<DeviceTile | null>(null);
  const [filter, setFilter] = useState<GameFilter>('ready');
  const [updating, setUpdating] = useState(false);
  const { snapshot, deviceId, offline, kicked, rejoin, act } = useLobby({ ...profile, host });

  const playing = snapshot?.phase === 'playing';
  useEffect(() => {
    if (playing) setSheet(null);
  }, [playing]);

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
    setSheet(null);
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

  if (kicked) {
    return (
      <div className="center-screen">
        <div className="stack">
          <div className="big-avatar">👋</div>
          <h1>UGE</h1>
          <p className="muted">You were removed from this room.</p>
          <button className="primary" onClick={rejoin}>
            Join again
          </button>
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
  const playingManifest =
    snapshot.game && snapshot.games.find((g) => g.manifest.id === snapshot.game!.id)?.manifest;
  const selectedEntry = snapshot.games.find((g) => g.manifest.id === snapshot.selectedGameId) ?? null;
  const sheetEl =
    sheet === 'profile' ? (
      <ProfileSheet initial={profile} onSave={saveProfile} onClose={() => setSheet(null)} />
    ) : sheet === 'help' ? (
      (() => {
        const m =
          playingManifest ??
          snapshot.games.find((g) => g.manifest.id === snapshot.selectedGameId)?.manifest;
        return m ? <HelpSheet manifest={m} onClose={() => setSheet(null)} /> : null;
      })()
    ) : sheet === 'game' && selectedEntry ? (
      <GameSheet
        entry={selectedEntry}
        snapshot={snapshot}
        myRole={me?.role ?? null}
        iAmTable={iAmTable}
        act={act}
        onClose={() => setSheet(null)}
      />
    ) : sheet === 'feedback' ? (
      <FeedbackSheet
        name={profile.name}
        game={snapshot.game?.name ?? playingManifest?.name ?? null}
        onClose={() => setSheet(null)}
      />
    ) : sheet === 'invite' ? (
      <InviteSheet
        session={session}
        meSeats={me?.seats ?? 1}
        meIsTable={iAmTable}
        onSeats={(n) => act('/api/lobby/seats', { seats: n })}
        onTable={(on) => act('/api/lobby/table', { on })}
        onUpdate={update}
        onFeedback={() => setSheet('feedback')}
        onClose={() => setSheet(null)}
      />
    ) : null;

  // ---- a game is running
  if (snapshot.phase === 'playing' && snapshot.game) {
    const showControls = iAmTable || !snapshot.setup.hasTable;
    return (
      <>
        {offline && <p className="table-offline">connection lost — reconnecting…</p>}
        <div className="game-viewport">
          <GameScreen game={snapshot.game} move={(name, ...args) => act('/api/game/move', { name, args })} />
        </div>
        {snapshot.game.over && iAmTable && <Celebration />}
        {!iAmTable && (
          <button className="profile-chip" onClick={() => setSheet('profile')}>
            {profile.avatar}
          </button>
        )}
        <button className="help-chip" onClick={() => setSheet('help')} aria-label="how to play">
          ?
        </button>
        <button className="say-chip" onClick={() => setSheet('feedback')} aria-label="send feedback">
          💬
        </button>
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
        {sheetEl}
      </>
    );
  }

  // ---- home
  const { players, phones, hasTable } = snapshot.setup;
  const counts: Record<GameFilter, number> = {
    ready: filterGames(snapshot.games, 'ready').length,
    solo: filterGames(snapshot.games, 'solo').length,
    party: filterGames(snapshot.games, 'party').length,
    all: snapshot.games.length,
  };
  const shown = filterGames(snapshot.games, filter);

  return (
    <div className="app">
      <header className="appbar">
        <a className="wordmark" href={`${roomBase}/`} title="UGE home">
          UGE
        </a>
        <div className="appbar-right">
          {session?.roomCode && (
            <button className="pill room-chip" onClick={() => setSheet('invite')}>
              <span className="dot" /> {session.roomCode}
            </button>
          )}
          {iAmTable ? (
            <span className="pill table-chip">🖥️ table</span>
          ) : (
            <button className="pill me-chip" onClick={() => setSheet('profile')}>
              <span className="ava">{profile.avatar}</span>
              {profile.name}
            </button>
          )}
          <button className="pill icon" onClick={() => setSheet('invite')} aria-label="invite">
            ＋
          </button>
        </div>
      </header>

      {offline && <p className="offline">connection lost — retrying…</p>}

      <section className="card group-card">
        <PeopleStrip devices={snapshot.devices} myId={deviceId} onPick={setPerson} />
        <div className="group-foot">
          <div className="setup-line">
            <span className="stat">
              <b>{players}</b> player{players === 1 ? '' : 's'}
            </span>
            <span className="stat">
              <b>{phones}</b> device{phones === 1 ? '' : 's'}
            </span>
            {hasTable && <span className="stat on">table screen</span>}
          </div>
          <div className="group-acts">
            <button className="ghost" onClick={() => setSheet('invite')}>
              ＋ Add people
            </button>
            {!iAmTable && phones >= 2 && !hasTable && (
              <button className="ghost accent" onClick={() => act('/api/lobby/table', { on: true })}>
                📺 Be the table
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="section-head">
        <h2>Pick a game</h2>
        <Segmented value={filter} onChange={setFilter} counts={counts} />
      </div>

      <GameGrid
        games={shown}
        selectedGameId={snapshot.selectedGameId}
        onSelect={(gameId) => {
          void act('/api/lobby/select', { gameId });
          setSheet('game');
        }}
      />

      {sheetEl}
      {person && (
        <Sheet title={person.name} onClose={() => setPerson(null)}>
          <div className="big-avatar">{person.avatar}</div>
          <p className="muted">
            {person.bot
              ? 'an AI opponent'
              : person.isTable
                ? 'the table screen'
                : person.seats > 1
                  ? `${person.seats} people on this device`
                  : 'on their own device'}
          </p>
          {person.id === deviceId ? (
            <button className="wide" onClick={() => (setPerson(null), setSheet('profile'))}>
              Change my name & look
            </button>
          ) : person.bot ? (
            <button className="wide" onClick={() => setPerson(null)}>
              Close
            </button>
          ) : (
            <button
              className="danger wide"
              onClick={() => {
                void act('/api/lobby/kick', { targetId: person.id });
                setPerson(null);
              }}
            >
              Remove from the room
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}
