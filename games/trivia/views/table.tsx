import './style.css';
import type { CSSProperties } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import { avatarFor, colorFor } from '../../../src/shared/avatar.js';
import type { TriviaView } from '../game.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function TableView({ view, players, over, move, serverNow }: GameViewProps<TriviaView>) {
  // the table drives the clock: reveal when time is up, advance after reveals
  const remaining = useDeadline({
    active: !over && view.phase !== 'done',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move(view.phase === 'question' ? 'timeUp' : 'next'),
  });

  const answeredCount = view.answered.filter(Boolean).length;

  return (
    <div className="tv-screen">
      <div className="tv-scores">
        {view.playerNames.map((name, i) => (
          <div key={i} className="tv-player" style={{ '--seat': colorFor(i) } as CSSProperties}>
            <span>{players[i]?.avatar ?? avatarFor(name)}</span>
            <span className="tv-name">{name}</span>
            <strong>{view.scores[i]}</strong>
          </div>
        ))}
      </div>

      {view.phase === 'done' || over ? (
        <p className="tv-over">{over?.text ?? 'Done!'}</p>
      ) : (
        <>
          <p className="tv-progress">
            Question {view.qIdx + 1} / {view.total}
            {view.phase === 'question' && <span className="tv-clock"> · {formatSeconds(remaining)}s</span>}
          </p>
          <h1 className="tv-question">{view.q}</h1>
          <div className="tv-choices">
            {view.choices.map((c, i) => (
              <div
                key={i}
                className={
                  view.correct === null
                    ? 'tv-choice'
                    : i === view.correct
                      ? 'tv-choice tv-correct'
                      : 'tv-choice tv-wrong'
                }
              >
                <span className="tv-letter">{LETTERS[i]}</span> {c}
              </div>
            ))}
          </div>
          <p className="tv-status">
            {view.phase === 'question'
              ? `${answeredCount} / ${view.playerNames.length} locked in — answer on your phone`
              : 'get ready for the next one…'}
          </p>
          {view.phase === 'question' && (
            <div className="tv-bar">
              <div
                className="tv-bar-fill"
                style={{ width: `${Math.max(0, Math.min(100, (remaining / 15000) * 100))}%` }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
