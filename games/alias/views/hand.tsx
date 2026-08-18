import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import { avatarFor } from '../../../src/shared/avatar.js';
import type { AliasView } from '../game.js';

export default function HandView({ view, players, over, move, serverNow }: GameViewProps<AliasView>) {
  const remaining = useDeadline({
    active: !over && view.phase === 'round',
    endsAt: view.endsAt,
    serverNow,
  });

  const iExplain = view.myIndex === view.turn;
  const explainer = view.playerNames[view.turn] ?? '?';
  const explainerAvatar = players[view.turn]?.avatar ?? avatarFor(explainer);

  if (over || view.phase === 'done') {
    return (
      <div className="al-screen">
        <p className="al-over">{over?.text ?? 'Done!'}</p>
        {view.myIndex >= 0 && (
          <p className="al-hint">
            you explained {view.scores[view.myIndex]} words ({view.skips[view.myIndex]} skips)
          </p>
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
            <h1 className="al-big">You're up! 🎤</h1>
            <p className="al-hint">
              explain as many words as you can in {Math.round(view.roundMs / 1000)}s — without saying the word!
            </p>
            <button className="al-start" onClick={() => move('startRound')}>
              Start my round
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
      <p className="al-hint">score this round: {view.scores[view.myIndex]}</p>
    </div>
  );
}
