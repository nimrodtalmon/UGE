import './style.css';
import { useEffect, useState } from 'react';
import { useDeadline, useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { SUITS } from '../game.js';
import type { HeartsView } from '../game.js';
import { CardFace, HandSummary, nameOf, PASS_ARROW, ScoreRow, TrickStrip } from './parts.js';

export default function HandView({ view, players, over, move, serverNow }: GameViewProps<HeartsView>) {
  const [picked, setPicked] = useState<number[]>([]);
  const passing = view.phase === 'passing';
  const iPassed = view.myIndex >= 0 && (view.passed[view.myIndex] ?? false);
  const myTurn = !over && view.phase === 'play' && view.turn === view.myIndex;

  useTurnBuzz(myTurn);
  useEffect(() => setPicked([]), [view.handNum, view.phase]);

  // phones back up the table's timer moves (its tab may be backgrounded)
  useDeadline({
    active: !over && view.phase === 'trickEnd',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('clearTrick'),
  });
  useDeadline({
    active: !over && view.phase === 'handover',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('nextHand'),
  });

  if (view.hand === null || view.myIndex < 0) {
    return (
      <div className="ht-screen">
        <p className="ht-status">Hearts in progress — you're watching.</p>
      </div>
    );
  }

  if (over) {
    return (
      <div className="ht-screen">
        <p className="ht-over">{over.text}</p>
        <ScoreRow view={view} players={players} />
      </div>
    );
  }

  const togglePick = (i: number) => {
    if (iPassed) return;
    setPicked(
      picked.includes(i) ? picked.filter((p) => p !== i) : picked.length < 3 ? [...picked, i] : picked,
    );
  };

  const status = passing
    ? iPassed
      ? `passed — waiting for ${
          view.passed.map((p, i) => (p ? null : nameOf(view, players, i))).filter(Boolean).join(', ') || '…'
        }`
      : `pick 3 cards to pass (${picked.length}/3)`
    : view.phase === 'play'
      ? myTurn
        ? view.ledSuit !== null
          ? `your turn — ${SUITS[view.ledSuit]} led`
          : view.trickNum === 0
            ? 'your lead — the 2♣ opens'
            : 'your lead'
        : `${nameOf(view, players, view.turn)} plays…`
      : view.phase === 'trickEnd'
        ? `${nameOf(view, players, view.trickWinner ?? 0)} takes the trick`
        : 'hand over';

  return (
    <div className="ht-screen ht-phone">
      <ScoreRow view={view} players={players} />

      {view.phase === 'handover' ? (
        <HandSummary view={view} players={players} />
      ) : passing ? null : (
        <TrickStrip view={view} players={players} />
      )}

      <p className={myTurn || (passing && !iPassed) ? 'ht-status mine' : 'ht-status'}>{status}</p>

      <div className="ht-hand">
        {view.hand.map((card, i) => {
          const usable = passing ? !iPassed : myTurn && (view.legal?.[i] ?? false);
          return (
            <button
              key={i}
              className={[
                'ht-slot',
                usable && 'playable',
                passing && picked.includes(i) && 'picked',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!usable}
              onClick={() => (passing ? togglePick(i) : move('playCard', i))}
            >
              <CardFace card={card} />
            </button>
          );
        })}
      </div>

      {/* the slot survives the pass: dropping the button would re-centre the
          column and drag the fan down over the finger */}
      {passing && (
        <div className="ht-foot">
          {!iPassed && (
            <button
              className="ht-pass-btn"
              disabled={picked.length !== 3}
              onClick={() => move('passCards', picked)}
            >
              Pass {PASS_ARROW[view.passDir]}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
