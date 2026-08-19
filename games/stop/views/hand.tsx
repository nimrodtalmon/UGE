import './style.css';
import { useEffect, useRef, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import type { StopView } from '../game.js';

export default function HandView({ view, over, move, serverNow }: GameViewProps<StopView>) {
  // answers live ONLY here while typing — the server sees nothing until STOP/submit
  const [drafts, setDrafts] = useState<string[]>(() => view.categories.map(() => ''));
  const autoSent = useRef(-1);

  // phones back up the table's clock (vital if the table tab is backgrounded)
  const remaining = useDeadline({
    active: !over && view.phase !== 'done',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () =>
      move(view.phase === 'write' ? 'closeRound' : view.phase === 'closing' ? 'scoreRound' : 'nextRound'),
  });

  // fresh sheet each round
  useEffect(() => {
    setDrafts(view.categories.map(() => ''));
  }, [view.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // closing grace window: hand in whatever is typed, once
  useEffect(() => {
    if (
      view.phase === 'closing' &&
      view.myIndex >= 0 &&
      !view.iSubmitted &&
      autoSent.current !== view.round
    ) {
      autoSent.current = view.round;
      move('submitAnswers', drafts.map((d) => d.trim()));
    }
  }, [view.phase, view.round, view.myIndex, view.iSubmitted, drafts, move]);

  if (view.myIndex < 0) {
    return (
      <div className="st2-screen st2-phone">
        <p className="st2-status">Stop! in progress — you're watching.</p>
      </div>
    );
  }

  if (view.phase === 'done' || over) {
    return (
      <div className="st2-screen st2-phone">
        <p className="st2-over">{over?.text ?? 'Done!'}</p>
        <p className="st2-status">You finished with {view.scores[view.myIndex]} points</p>
      </div>
    );
  }

  if (view.phase === 'reveal') {
    const myAnswers = view.answers?.[view.myIndex] ?? null;
    const myCells = view.cellScores?.[view.myIndex] ?? null;
    const gained = (myCells ?? []).reduce((sum, p) => sum + p, 0);
    const iGotBonus = view.stopperBonus && view.stopper === view.myIndex;
    return (
      <div className="st2-screen st2-phone">
        <p className="st2-progress">Round {view.round + 1} / {view.totalRounds} — letter {view.letter}</p>
        <div className="st2-sheet">
          {view.categories.map((cat, c) => {
            const points = myCells?.[c] ?? 0;
            const text = myAnswers?.[c]?.trim() ?? '';
            return (
              <div key={c} className="st2-revealrow">
                <span className="st2-cat">{cat}</span>
                <span className={points === 10 ? 'st2-mine st2-p10' : points === 5 ? 'st2-mine st2-p5' : 'st2-mine st2-p0'}>
                  <span className="st2-word">{text === '' ? '—' : text}</span>
                  <span className="st2-points">{points > 0 ? `+${points}` : '0'}</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="st2-status">
          +{gained + (iGotBonus ? 5 : 0)} this round{iGotBonus ? ' (incl. ★+5 stop bonus)' : ''} · total{' '}
          {view.scores[view.myIndex]}
        </p>
      </div>
    );
  }

  // write / closing
  const allFilled = drafts.every((d) => d.trim() !== '');
  const locked = view.phase !== 'write' || view.iSubmitted;

  return (
    <div className="st2-screen st2-phone">
      <p className="st2-progress">
        Round {view.round + 1} / {view.totalRounds}
        <span className="st2-clock"> · {formatSeconds(remaining)}s</span>
      </p>
      <div className="st2-letter">{view.letter}</div>

      <div className="st2-sheet">
        {view.categories.map((cat, c) => (
          <label key={c} className="st2-field">
            <span className="st2-cat">{cat}</span>
            <input
              className="st2-input"
              type="text"
              maxLength={40}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder={`${view.letter}…`}
              value={drafts[c] ?? ''}
              disabled={locked}
              onChange={(e) => {
                const next = [...drafts];
                next[c] = e.target.value;
                setDrafts(next);
              }}
            />
          </label>
        ))}
      </div>

      {view.phase === 'closing' ? (
        <p className="st2-status st2-stopped">
          {view.stopper === view.myIndex
            ? 'You stopped the round!'
            : view.stopper !== null
              ? `${view.names[view.stopper]} shouted STOP! — handing in…`
              : 'Time! — handing in…'}
        </p>
      ) : view.iSubmitted ? (
        <p className="st2-status">Handed in — waiting for the others…</p>
      ) : (
        <button
          className="st2-stop"
          disabled={!allFilled || locked}
          onClick={() => move('stopRound', drafts.map((d) => d.trim()))}
        >
          🛑 STOP!
        </button>
      )}
    </div>
  );
}
