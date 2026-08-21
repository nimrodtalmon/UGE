import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { MnView } from '../game.js';
import type { Side } from '../rules.js';
import { storeOf } from '../rules.js';
import { Board } from './parts.js';

export default function HandView({ view, over, move }: GameViewProps<MnView>) {
  const mySeat: Side = view.myIndex === 1 ? 1 : 0;
  const myTurn = !over && view.myIndex >= 0 && view.myIndex === view.turn;
  useTurnBuzz(myTurn);
  const last = view.last;

  const status = over
    ? over.text
    : myTurn
      ? view.again
        ? '🔁 go again!'
        : 'your move — pick a pit'
      : `${view.names[view.turn]} is thinking…`;

  const note = over
    ? ''
    : view.again && !myTurn
      ? `${view.names[view.turn]} landed in their store — another turn`
      : last && last.captured > 0
        ? `${view.names[last.by]} captured ${last.captured} seeds!`
        : myTurn
          ? 'your row is the near one — seeds go left to right'
          : '';

  return (
    <div className="mn-screen mn-phone">
      <p className={myTurn && view.again ? 'mn-status again' : 'mn-status'}>{status}</p>
      {/* always rendered: a line appearing above the board would shove every
          pit down, right as one is about to be tapped */}
      <p className="mn-note">{note || ' '}</p>
      <Board view={view} perspective={mySeat} onTap={myTurn ? (p) => move('sow', p) : undefined} />
      <p className="mn-scores">
        🫘 you {view.pits[storeOf(mySeat)] ?? 0}&ensp;·&ensp;
        {view.names[mySeat === 0 ? 1 : 0]} {view.pits[storeOf(mySeat === 0 ? 1 : 0)] ?? 0}
      </p>
    </div>
  );
}
