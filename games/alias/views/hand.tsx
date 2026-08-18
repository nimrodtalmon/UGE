import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import { avatarFor } from '../../../src/shared/avatar.js';
import type { AliasView } from '../game.js';

export default function HandView({ view, players, over, move, serverNow }: GameViewProps<AliasView>) {
  // phones back up the table's round clock (table tab may be backgrounded)
  const remaining = useDeadline({
    active: !over && view.phase === 'round',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('endRound'),
  });

  const iExplain = view.pass || view.myIndex === view.turn;
  const live = view.pass ? undefined : players[view.turn];
  const explainer = live?.name ?? view.playerNames[view.turn] ?? '?';
  const explainerAvatar = live?.avatar ?? avatarFor(explainer);

  if (over || view.phase === 'done') {
    return (
      <div className="al-screen">
        <p className="al-over">{over?.text ?? 'Done!'}</p>
        {view.teams ? (
          <p className="al-hint">🔴 {view.scores[0]} — 🔵 {view.scores[1]}</p>
        ) : (
          view.myIndex >= 0 &&
          !view.pass && (
            <p className="al-hint">
              you explained {view.scores[view.myIndex]} words ({view.skips[view.myIndex]} skips)
            </p>
          )
        )}
      </div>
    );
  }

  if (view.myIndex < 0) {
    return (
      <div className="al-screen">
        <p className="al-hint">Alias in progress — you're watching.</p>
      </div>
    );
  }

  if (view.phase === 'ready') {
    return (
      <div className="al-screen">
        {iExplain ? (
          <>
            <h1 className="al-big">
              {view.teams
                ? `Round ${view.turn + 1}/${view.totalRounds} — ${view.turn % 2 === 0 ? '🔴 Red' : '🔵 Blue'} team! 🎤`
                : view.pass
                  ? `Round ${view.turn + 1}/${view.totalRounds} — pass the phone! 🎤`
                  : "You're up! 🎤"}
            </h1>
            <p className="al-hint">
              {view.teams
                ? `a ${view.turn % 2 === 0 ? 'red' : 'blue'} player explains — only their team guesses! `
                : view.pass
                  ? `${explainer} explains — `
                  : ''}
              explain as many words as you can in {Math.round(view.roundMs / 1000)}s — without saying the word!
            </p>
            <button className="al-start" onClick={() => move('startRound')}>
              {view.pass ? 'Start the round' : 'Start my round'}
            </button>
          </>
        ) : (
          <>
            <h1 className="al-big">
              {explainerAvatar} {explainer} is up next
            </h1>
            <p className="al-hint">get ready to guess out loud</p>
          </>
        )}
      </div>
    );
  }

  // round in progress
  if (!iExplain) {
    return (
      <div className="al-screen">
        <div className="al-clock">{formatSeconds(remaining)}</div>
        <p className="al-hint">{explainer} is explaining — guess out loud!</p>
      </div>
    );
  }

  return (
    <div className="al-screen">
      <div className="al-clock small">{formatSeconds(remaining)}</div>
      <div className="al-word">{view.word}</div>
      <div className="al-actions">
        <button className="al-got" onClick={() => move('gotIt')}>
          Got it ✓
        </button>
        <button className="al-skip" onClick={() => move('skip')}>
          Skip ↷
        </button>
      </div>
      <p className="al-hint">
        score this round: {view.scores[view.teams ? view.turn % 2 : view.pass ? view.turn : view.myIndex]}
      </p>
    </div>
  );
}
