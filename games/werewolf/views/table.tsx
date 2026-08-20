import './style.css';
import type { CSSProperties } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import { colorFor } from '../../../src/shared/avatar.js';
import type { WerewolfView } from '../game.js';
import { DeathsLog, avatarAt, nameAt, roleLabel } from './parts.js';

/** Display-only: the table never plays, but it drives the day timer. */
export default function TableView({ view, players, over, move, serverNow }: GameViewProps<WerewolfView>) {
  const remaining = useDeadline({
    active: !over && view.phase === 'day',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('startVote'),
  });

  const seats = view.alive.map((_, i) => i);
  const aliveSeats = seats.filter((i) => view.alive[i]);
  const roleOf = (i: number) => view.deaths.find((d) => d.seat === i)?.role ?? null;
  const tally = seats.map((t) => aliveSeats.filter((s) => view.votes[s] === t).length);
  const killed = view.deaths.find((d) => d.night === view.night && d.how === 'night');

  return (
    <div className="ww-screen">
      <div className="ww-players">
        {seats.map((i) => {
          const dead = !view.alive[i];
          const r = roleOf(i);
          return (
            <div
              key={i}
              className={dead ? 'ww-chip dead' : 'ww-chip'}
              style={{ '--seat': colorFor(i) } as CSSProperties}
            >
              <span>{dead ? '💀' : avatarAt(players, i)}</span>
              <span className="ww-chip-name">{nameAt(players, i)}</span>
              {dead && r && <span className="ww-chip-role">{roleLabel(r)}</span>}
              {/* the tick and the tally hold their width: a chip that grows
                  mid-phase rewraps the whole village row */}
              {!over && view.phase === 'reveal' && (
                <span className="ww-chip-tick">{view.ready[i] ? '✓' : ''}</span>
              )}
              {!over && view.phase === 'vote' && !dead && (
                <strong className={tally[i]! > 0 ? 'ww-chip-votes' : 'ww-chip-votes none'}>
                  {tally[i]! > 0 ? tally[i] : ''}
                </strong>
              )}
            </div>
          );
        })}
      </div>

      {over ? (
        <>
          <p className="ww-over">{over.text}</p>
          <DeathsLog deaths={view.deaths} players={players} />
        </>
      ) : view.phase === 'reveal' ? (
        <>
          <h1 className="ww-banner">🌘 a dark secret settles on the village</h1>
          <p className="ww-hint">
            check your phones — quietly! ({seats.filter((i) => view.ready[i]).length}/{aliveSeats.length} ready)
          </p>
        </>
      ) : view.phase === 'night' ? (
        <>
          <h1 className="ww-banner">the village sleeps 🌙</h1>
          <div className="ww-progress">
            <p className={view.wolvesPicked >= view.wolvesAlive ? 'ww-hint done' : 'ww-hint'}>
              🐺 {view.wolvesPicked >= view.wolvesAlive
                ? 'the wolves have chosen…'
                : `the wolves are prowling… (${view.wolvesPicked}/${view.wolvesAlive})`}
            </p>
            {view.seerAlive && (
              <p className={view.seerDone ? 'ww-hint done' : 'ww-hint'}>
                🔮 {view.seerDone ? 'the seer has seen enough' : 'the seer is looking…'}
              </p>
            )}
          </div>
          <DeathsLog deaths={view.deaths} players={players} />
        </>
      ) : view.phase === 'day' ? (
        <>
          <h1 className="ww-banner">☀️ dawn breaks on day {view.night}</h1>
          {killed && (
            <p className="ww-announce">
              {avatarAt(players, killed.seat)} {killed.name} was killed in the night — they were{' '}
              {roleLabel(killed.role)}
            </p>
          )}
          <div className="ww-clock">{formatSeconds(remaining)}</div>
          <div className="ww-bar">
            <div
              className="ww-bar-fill"
              style={{ width: `${Math.max(0, Math.min(100, (remaining / view.dayMs) * 100))}%` }}
            />
          </div>
          <p className="ww-hint">discuss — the vote begins when the sun sets</p>
        </>
      ) : (
        <>
          <h1 className="ww-banner">the village votes 🗳️</h1>
          <div className="ww-votes">
            {aliveSeats.map((s) => {
              const v = view.votes[s] ?? null;
              return (
                <p key={s} className="ww-vote-line">
                  {avatarAt(players, s)} {nameAt(players, s)}{' '}
                  {v === null ? (
                    <span className="ww-vote-pending">is deciding…</span>
                  ) : v === -1 ? (
                    <span>→ skip 🤷</span>
                  ) : (
                    <span>
                      → {avatarAt(players, v)} {nameAt(players, v)}
                    </span>
                  )}
                </p>
              );
            })}
          </div>
          <p className="ww-hint">a strict majority lynches — anything less and nobody dies</p>
        </>
      )}
    </div>
  );
}
