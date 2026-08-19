import './style.css';
import { useEffect, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { PokerView } from '../game.js';
import { CardFace, Seats } from './parts.js';

export default function HandView({ view, players, over, move, serverNow }: GameViewProps<PokerView>) {
  const me = view.myIndex >= 0 ? view.seats[view.myIndex] : undefined;
  const myTurn = !over && view.myIndex === view.toAct;
  const minTo = view.currentBet + view.minRaise;
  const maxTo = me ? me.streetBet + me.chips + 0 : 0;
  const [raiseTo, setRaiseTo] = useState(minTo);

  useTurnBuzz(myTurn);
  useEffect(() => {
    setRaiseTo(Math.min(minTo, maxTo));
  }, [myTurn, minTo, maxTo]);

  // phones back up the table's next-hand timer (table tab may be backgrounded)
  useDeadline({
    active: !over && view.stage === 'handover',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('nextHand'),
  });

  if (!me || view.myIndex < 0) {
    return (
      <div className="pk-screen">
        <p className="pk-turn">Poker in progress — you're watching.</p>
      </div>
    );
  }

  if (over) {
    return (
      <div className="pk-screen">
        <p className="pk-result">{over.text}</p>
        <Seats view={view} players={players} />
      </div>
    );
  }

  const canCheck = view.callAmount === 0;
  // raiseClosed: an incomplete all-in raise means call-or-fold only
  const canRaise = me.chips > view.callAmount && !view.raiseClosed;
  const clampedTo = Math.max(Math.min(raiseTo, maxTo), Math.min(minTo, maxTo));

  return (
    <div className="pk-screen pk-phone">
      <div className="pk-hole">
        {me.hole?.map((c, i) => <CardFace key={i} card={c} big />) ?? (
          <span className="pk-turn">no cards this hand</span>
        )}
      </div>
      <p className="pk-chips-line">
        {me.chips}💰{me.streetBet > 0 ? ` · bet ${me.streetBet}` : ''}
        {me.allIn ? ' · all-in' : ''}
      </p>
      <div className="pk-board small">
        {view.board.map((c, i) => (
          <CardFace key={i} card={c} />
        ))}
        {view.board.length === 0 && <span className="pk-turn">pot {view.pot}</span>}
      </div>

      {view.stage === 'handover' ? (
        <p className="pk-result">{view.handResult}</p>
      ) : me.folded ? (
        <p className="pk-turn">folded — wait for the next hand</p>
      ) : me.allIn ? (
        <p className="pk-turn">all-in — fingers crossed 🤞</p>
      ) : myTurn ? (
        <>
          <p className="pk-turn mine">your move</p>
          <div className="pk-actions">
            <button className="pk-fold" onClick={() => move('fold')}>
              Fold
            </button>
            <button className="pk-call" onClick={() => move('call')}>
              {canCheck ? 'Check' : `Call ${view.callAmount}`}
            </button>
          </div>
          {canRaise && (
            <div className="pk-raise">
              <button className="pk-step" onClick={() => setRaiseTo(Math.max(Math.min(minTo, maxTo), clampedTo - view.bb))}>
                −
              </button>
              <button className="pk-do-raise" onClick={() => move('raise', clampedTo)}>
                {clampedTo >= maxTo ? `All-in ${maxTo}` : `Raise to ${clampedTo}`}
              </button>
              <button className="pk-step" onClick={() => setRaiseTo(Math.min(maxTo, clampedTo + view.bb))}>
                +
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="pk-turn">{view.names[view.toAct] ?? '…'} is thinking…</p>
      )}
    </div>
  );
}
