import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import type { PokerView } from '../game.js';
import { CardFace, Seats } from './parts.js';

export default function TableView({ view, players, over, move, serverNow }: GameViewProps<PokerView>) {
  // the table drives the pause between hands
  const remaining = useDeadline({
    active: !over && view.stage === 'handover',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('nextHand'),
  });

  return (
    <div className="pk-screen">
      <Seats view={view} players={players} />
      <div className="pk-felt">
        <div className="pk-board">
          {view.board.map((c, i) => (
            <CardFace key={i} card={c} big />
          ))}
          {Array.from({ length: 5 - view.board.length }, (_, i) => (
            <span key={`e${i}`} className="pk-card big slot" />
          ))}
        </div>
        <p className="pk-pot">pot {view.pot}</p>
      </div>
      {/* fixed-height slot: these three lines differ in length, and the felt
          above them should not hop every time the hand ends */}
      <div className="pk-status">
        {over ? (
          <p className="pk-result">{over.text}</p>
        ) : view.stage === 'handover' ? (
          <p className="pk-result">
            {view.handResult} <span className="pk-next">· next hand in {formatSeconds(remaining)}s</span>
          </p>
        ) : (
          <p className="pk-turn">
            {players[view.toAct]?.name ?? view.names[view.toAct] ?? '…'} to act
            {view.currentBet > 0 ? ` — bet is ${view.currentBet}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
