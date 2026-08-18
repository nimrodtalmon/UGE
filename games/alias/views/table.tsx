import './style.css';
import type { CSSProperties } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import { avatarFor, colorFor } from '../../../src/shared/avatar.js';
import type { AliasView } from '../game.js';

export default function TableView({ view, players, over, move, serverNow }: GameViewProps<AliasView>) {
  const remaining = useDeadline({
    active: !over && view.phase === 'round',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('endRound'),
  });

  const liveAt = (i: number) => (view.pass ? undefined : players[i]);
  const explainer = liveAt(view.turn)?.name ?? view.playerNames[view.turn] ?? '?';
  const explainerAvatar = liveAt(view.turn)?.avatar ?? avatarFor(explainer);

  return (
    <div className="al-screen">
      <div className="al-scores">
        {view.playerNames.map((name, i) => (
          <div
            key={i}
            className={!over && i === view.turn ? 'al-player current' : 'al-player'}
            style={{ '--seat': colorFor(i) } as CSSProperties}
          >
            <span>{liveAt(i)?.avatar ?? avatarFor(name)}</span>
            <span className="al-name">{liveAt(i)?.name ?? name}</span>
            <strong>{view.scores[i]}</strong>
          </div>
        ))}
      </div>

      {over || view.phase === 'done' ? (
        <p className="al-over">{over?.text ?? 'Done!'}</p>
      ) : view.phase === 'ready' ? (
        <>
          <h1 className="al-big">
            {view.pass
              ? `Round ${view.turn + 1} of ${view.totalRounds}`
              : `${explainerAvatar} ${explainer} is up next`}
          </h1>
          <p className="al-hint">
            {view.pass
              ? `pass the phone to ${explainer} — start from the phone, everyone else guesses out loud`
              : `start the round from ${explainer}'s phone — everyone else guesses out loud`}
          </p>
        </>
      ) : (
        <>
          <div className="al-clock">{formatSeconds(remaining)}</div>
          <div className="al-bar">
            <div
              className="al-bar-fill"
              style={{ width: `${Math.max(0, Math.min(100, (remaining / view.roundMs) * 100))}%` }}
            />
          </div>
          <p className="al-hint">
            {explainer} is explaining — shout your guesses! (the word is on their phone only)
          </p>
        </>
      )}
    </div>
  );
}
