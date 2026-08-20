import './style.css';
import { useEffect, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds, useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { Bid, LdView } from '../game.js';

const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const FACES = [2, 3, 4, 5, 6];

/** The smallest bid that beats the current one (first bid: one ⚁). */
const minRaise = (bid: Bid | null): Bid =>
  bid === null
    ? { quantity: 1, face: 2 }
    : bid.face < 6
      ? { quantity: bid.quantity, face: bid.face + 1 }
      : { quantity: bid.quantity + 1, face: 2 };

export default function HandView({ view, over, move, serverNow }: GameViewProps<LdView>) {
  const me = view.myIndex >= 0 ? view.seats[view.myIndex] : undefined;
  const myTurn = !over && view.phase === 'bidding' && view.myIndex === view.turn && !!me && !me.out;
  const [quantity, setQuantity] = useState(1);
  const [face, setFace] = useState(2);

  useTurnBuzz(myTurn);
  useEffect(() => {
    const m = minRaise(view.bid);
    setQuantity(Math.min(m.quantity, view.totalDice));
    setFace(m.face);
  }, [myTurn, view.bid?.quantity, view.bid?.face, view.totalDice]);

  // phones back up the table's next-round timer (table tab may be backgrounded)
  const remaining = useDeadline({
    active: !over && view.phase === 'reveal',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('nextRound'),
  });

  if (!me) {
    return (
      <div className="ld-screen">
        <p className="ld-turn">Liar's Dice in progress — you're watching.</p>
      </div>
    );
  }

  if (over) {
    return (
      <div className="ld-screen">
        <p className="ld-result">{over.text}</p>
      </div>
    );
  }

  const bid = view.bid;
  const minQ = bid ? bid.quantity : 1;
  const beats = bid === null || quantity > bid.quantity || (quantity === bid.quantity && face > bid.face);
  const legal =
    quantity >= 1 && quantity <= view.totalDice && face >= 2 && face <= 6 && beats;

  if (view.phase === 'reveal') {
    return (
      <div className="ld-screen ld-phone">
        <div className="ld-reveal">
          {view.seats.map((seat, i) =>
            seat.count > 0 ? (
              <div key={i} className="ld-reveal-row">
                <span className="ld-reveal-name">{view.names[i]}</span>
                <span className="ld-reveal-dice">
                  {seat.dice?.map((d, j) => (
                    <span
                      key={j}
                      className={`ld-die${bid && (d === bid.face || d === 1) ? ' hit' : ''}`}
                    >
                      {DIE[d - 1]}
                    </span>
                  ))}
                </span>
              </div>
            ) : null,
          )}
        </div>
        {bid && (
          <p className="ld-tally">
            {view.tally} × {DIE[bid.face - 1]} — the bid was {bid.quantity} {DIE[bid.face - 1]}
          </p>
        )}
        <p className="ld-verdict">
          {view.loser === view.myIndex ? 'you lose a die 😬' : `${view.names[view.loser]} loses a die`}
          <span className="ld-next"> · next round in {formatSeconds(remaining)}s</span>
        </p>
      </div>
    );
  }

  return (
    <div className="ld-screen ld-phone">
      <div className="ld-mine">
        {me.out ? (
          <p className="ld-turn">out of dice — watching the bluffs</p>
        ) : (
          me.dice?.map((d, i) => (
            <span key={i} className="ld-die big mine">{DIE[d - 1]}</span>
          ))
        )}
      </div>

      {/* two lines held: this line grows from "no bid yet" to a full bid and
          would push the stepper and the Bid/Dudo buttons down */}
      <p className="ld-bid-line hold2">
        {bid ? (
          <>
            bid: <strong>{bid.quantity} {DIE[bid.face - 1]}</strong> by {view.names[view.bidder]}
          </>
        ) : (
          'no bid yet'
        )}
        <span className="ld-hint"> · {view.totalDice} dice in play</span>
      </p>

      {myTurn ? (
        <>
          <p className="ld-turn mine">your move</p>
          <div className="ld-stepper">
            <button
              className="ld-step"
              onClick={() => setQuantity((q) => Math.max(minQ, q - 1))}
            >
              −
            </button>
            <span className="ld-qty">{quantity}</span>
            <button
              className="ld-step"
              onClick={() => setQuantity((q) => Math.min(view.totalDice, q + 1))}
            >
              +
            </button>
          </div>
          <div className="ld-faces">
            {FACES.map((f) => (
              <button
                key={f}
                className={`ld-face${f === face ? ' selected' : ''}`}
                onClick={() => setFace(f)}
              >
                {DIE[f - 1]}
              </button>
            ))}
          </div>
          <div className="ld-actions">
            <button
              className="ld-do-bid"
              disabled={!legal}
              onClick={() => move('bid', quantity, face)}
            >
              Bid {quantity} {DIE[face - 1]}
            </button>
            {bid !== null && (
              <button className="ld-dudo" onClick={() => move('dudo')}>
                Liar! (dudo)
              </button>
            )}
          </div>
          {/* always rendered: a hint appearing on an illegal step re-centres the
              column and slides the stepper out from under the thumb */}
          <p className="ld-hint hold1">
            {legal ? ' ' : `must beat ${bid?.quantity ?? ''} ${bid ? DIE[bid.face - 1] : ''}`}
          </p>
        </>
      ) : (
        <p className="ld-turn">{view.names[view.turn]} is thinking…</p>
      )}
    </div>
  );
}
