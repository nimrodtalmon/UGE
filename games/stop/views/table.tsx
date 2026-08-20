import './style.css';
import type { CSSProperties } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import { avatarFor, colorFor } from '../../../src/shared/avatar.js';
import type { StopView } from '../game.js';

const WRITE_MS = 75_000;

function cellClass(points: number | undefined): string {
  if (points === 10) return 'st2-cell st2-p10';
  if (points === 5) return 'st2-cell st2-p5';
  return 'st2-cell st2-p0';
}

export default function TableView({ view, players, over, move, serverNow }: GameViewProps<StopView>) {
  // the table is display-only but drives the clock through every phase
  const remaining = useDeadline({
    active: !over && view.phase !== 'done',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () =>
      move(view.phase === 'write' ? 'closeRound' : view.phase === 'closing' ? 'scoreRound' : 'nextRound'),
  });

  const submittedCount = view.submitted.filter(Boolean).length;

  return (
    <div className="st2-screen">
      <div className="st2-scores">
        {view.names.map((name, i) => (
          <div
            key={i}
            className={i === view.stopper && view.phase !== 'write' ? 'st2-player stopper' : 'st2-player'}
            style={{ '--seat': colorFor(i) } as CSSProperties}
          >
            <span>{players[i]?.avatar ?? avatarFor(name)}</span>
            <span className="st2-name">{players[i]?.name ?? name}</span>
            {/* the tick holds its width: a pill that grows when someone hands
                in would rewrap the row and shove the round display around */}
            {view.phase !== 'reveal' && view.phase !== 'done' && (
              <span className="st2-tag">{view.submitted[i] ? '✓' : ''}</span>
            )}
            <strong>{view.scores[i]}</strong>
          </div>
        ))}
      </div>

      {view.phase === 'done' || over ? (
        <p className="st2-over">{over?.text ?? 'Done!'}</p>
      ) : (
        <p className="st2-progress">
          Round {view.round + 1} / {view.totalRounds}
          {view.phase !== 'reveal' && <span className="st2-clock"> · {formatSeconds(remaining)}s</span>}
        </p>
      )}

      {(view.phase === 'write' || view.phase === 'closing') && (
        <>
          <div className="st2-letter">{view.letter}</div>
          <ul className="st2-cats">
            {view.categories.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          {view.phase === 'closing' ? (
            <p className="st2-status st2-stopped">
              {view.stopper !== null
                ? `${view.names[view.stopper]} shouted STOP! — pens down…`
                : 'Time! — pens down…'}
            </p>
          ) : (
            <>
              <p className="st2-status">
                {submittedCount} / {view.names.length} done — write on your phone, first full sheet may STOP
              </p>
              <div className="st2-bar">
                <div
                  className="st2-bar-fill"
                  style={{ width: `${Math.max(0, Math.min(100, (remaining / WRITE_MS) * 100))}%` }}
                />
              </div>
            </>
          )}
        </>
      )}

      {(view.phase === 'reveal' || view.phase === 'done') && view.answers && view.cellScores && (
        <>
          <div className="st2-gridwrap">
            <table className="st2-grid">
              <thead>
                <tr>
                  <th className="st2-corner">{view.letter}…</th>
                  {view.names.map((name, i) => (
                    <th key={i} style={{ '--seat': colorFor(i) } as CSSProperties}>
                      {players[i]?.avatar ?? avatarFor(name)} {players[i]?.name ?? name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.categories.map((cat, c) => (
                  <tr key={c}>
                    <td className="st2-cat">{cat}</td>
                    {view.names.map((_, seat) => {
                      const text = view.answers?.[seat]?.[c]?.trim() ?? '';
                      const points = view.cellScores?.[seat]?.[c] ?? 0;
                      return (
                        <td key={seat} className={cellClass(points)}>
                          <span className="st2-word">{text === '' ? '—' : text}</span>
                          <span className="st2-points">{points > 0 ? `+${points}` : '0'}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="st2-totals">
                  <td className="st2-cat">total</td>
                  {view.scores.map((s, seat) => (
                    <td key={seat}>
                      {s}
                      {view.stopperBonus && seat === view.stopper && <span className="st2-bonus"> ★+5</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {view.phase === 'reveal' && (
            <p className="st2-status">
              {view.stopper !== null && view.stopperBonus
                ? `${view.names[view.stopper]} stopped with a clean sheet — +5 bonus!`
                : 'unique answers score 10, shared ones 5'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
