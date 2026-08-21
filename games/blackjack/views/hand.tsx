import './style.css';
import { useEffect, useState } from 'react';
import { formatSeconds, useDeadline, useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { BjView } from '../game.js';
import { Dealer, HandBox, nameOf, SeatChips } from './parts.js';

const STEP = 10;

export default function HandView({ view, players, over, move, serverNow }: GameViewProps<BjView>) {
  const me = view.myIndex >= 0 ? view.seats[view.myIndex] : undefined;
  const myTurn = !over && view.phase === 'play' && view.turn === view.myIndex;
  const betting = view.phase === 'bets' && me !== undefined && !me.ready && me.chips > 0;
  const [stake, setStake] = useState(me?.bet ?? 20);

  useTurnBuzz(myTurn);
  // a fresh round: start from what this seat staked last time, within its means
  useEffect(() => {
    if (view.phase === 'bets' && me) setStake(Math.max(Math.min(me.bet, me.chips), Math.min(STEP, me.chips)));
  }, [view.phase, view.round, me?.chips]);

  // every phone backs the table's countdowns up — the table tab may be asleep,
  // and solo play has no table at all. All three moves are idempotent.
  const betLeft = useDeadline({
    active: !over && view.phase === 'bets',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('closeBets'),
  });
  useDeadline({
    active: !over && view.phase === 'dealer',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('dealerStep'),
  });
  const payoutLeft = useDeadline({
    active: !over && view.phase === 'payout' && !view.finished,
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('nextRound'),
  });

  if (!me || view.myIndex < 0) {
    return (
      <div className="bj-screen">
        <p className="bj-status">Blackjack in progress — you're watching.</p>
        <SeatChips view={view} players={players} />
      </div>
    );
  }

  if (over) {
    return (
      <div className="bj-screen">
        <p className="bj-over">{over.text}</p>
        <SeatChips view={view} players={players} />
      </div>
    );
  }

  const hand = me.hands[me.active];
  const min = Math.min(view.minBet, me.chips);
  const clamped = Math.max(min, Math.min(stake, me.chips));
  const status = betting
    ? `place your bet — ${formatSeconds(betLeft)}s`
    : view.phase === 'bets'
      ? me.chips <= 0
        ? 'out of chips — sitting this one out'
        : `bet ${me.bet} in — waiting for the others`
      : view.phase === 'play'
        ? myTurn
          ? me.hands.length > 1
            ? `your hand ${me.active + 1} of ${me.hands.length}`
            : 'your move'
          : `${nameOf(view, players, view.turn)} is playing…`
        : view.phase === 'dealer'
          ? 'the dealer draws…'
          : `${me.net > 0 ? `you win ${me.net}` : me.net < 0 ? `you lose ${-me.net}` : 'no change'} · next in ${formatSeconds(payoutLeft)}s`;

  return (
    <div className="bj-screen bj-phone">
      <Dealer view={view} />
      <SeatChips view={view} players={players} hideIndex={view.myIndex} />

      <div className="bj-mine">
        {me.hands.length > 0 ? (
          me.hands.map((h, i) => (
            <HandBox key={i} hand={h} big={me.hands.length === 1} live={myTurn && i === me.active} />
          ))
        ) : (
          <p className="bj-chipcount big">{me.chips}💰</p>
        )}
      </div>

      <p className="bj-meline">
        {me.chips}💰 · round {view.round}
        {view.maxRounds > 0 ? ` of ${view.maxRounds}` : ''}
      </p>

      {/* held open: this line changes length every phase and the buttons under
          it must not walk out from under a thumb already on its way down */}
      <p className={myTurn || betting ? 'bj-status mine' : 'bj-status'}>{status}</p>

      <div className="bj-actions">
        {betting ? (
          <>
            <div className="bj-row">
              <button className="bj-step" onClick={() => setStake(Math.max(min, clamped - STEP))}>
                −
              </button>
              <button className="bj-do primary" onClick={() => move('bet', clamped)}>
                Bet {clamped}
              </button>
              <button className="bj-step" onClick={() => setStake(Math.min(me.chips, clamped + STEP))}>
                +
              </button>
            </div>
            <div className="bj-row">
              <button className="bj-do ghost" onClick={() => move('bet', min)}>
                Min {min}
              </button>
              <button className="bj-do ghost" onClick={() => move('bet', me.chips)}>
                All in {me.chips}
              </button>
            </div>
          </>
        ) : myTurn && hand ? (
          <>
            <div className="bj-row">
              <button className="bj-do hit" onClick={() => move('hit')}>
                Hit
              </button>
              <button className="bj-do stand" onClick={() => move('stand')}>
                Stand
              </button>
            </div>
            <div className="bj-row">
              {view.can.double && (
                <button className="bj-do extra" onClick={() => move('double')}>
                  Double {hand.bet}
                </button>
              )}
              {view.can.split && (
                <button className="bj-do extra" onClick={() => move('split')}>
                  Split
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
