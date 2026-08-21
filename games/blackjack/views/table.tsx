import './style.css';
import { formatSeconds, useDeadline } from '../../../src/shared/gameKit.js';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { BjView } from '../game.js';
import { Dealer, nameOf, SeatPanel } from './parts.js';

/** Display only: the felt. It drives the phase countdowns, nothing else. */
export default function TableView({ view, players, over, move, serverNow }: GameViewProps<BjView>) {
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

  return (
    <div className="bj-screen">
      <p className="bj-round">
        round {view.round}
        {view.maxRounds > 0 ? ` of ${view.maxRounds}` : ''} · {view.shoeLeft} cards in the shoe
      </p>
      <div className="bj-felt">
        <Dealer view={view} big />
      </div>
      <div className="bj-seats">
        {view.seats.map((_, i) => (
          <SeatPanel key={i} view={view} players={players} index={i} />
        ))}
      </div>
      {/* one status slot, reserved: the payout line wraps where "X to act" does not */}
      <div className="bj-statusbox">
        {over ? (
          <p className="bj-over">{over.text}</p>
        ) : view.phase === 'payout' ? (
          <p className="bj-result">
            {view.roundText}
            <span className="bj-next"> · next round in {formatSeconds(payoutLeft)}s</span>
          </p>
        ) : view.phase === 'dealer' ? (
          <p className="bj-result">the dealer draws…</p>
        ) : view.phase === 'bets' ? (
          <p className="bj-status">place your bets · {formatSeconds(betLeft)}s</p>
        ) : (
          <p className="bj-status">{nameOf(view, players, view.turn)} to act</p>
        )}
      </div>
    </div>
  );
}
