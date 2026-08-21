import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { RvView } from '../game.js';
import { Board, Score } from './Board.js';

export default function HandView({ view, players, over, move }: GameViewProps<RvView>) {
  const me = view.myIndex;
  const myTurn = !over && me >= 0 && view.current === me;
  useTurnBuzz(myTurn);
  const names: [string, string] = [
    players[0]?.name ?? view.names[0],
    players[1]?.name ?? view.names[1],
  ];
  const turnName = names[view.current === 0 ? 0 : 1];

  return (
    <div className="rv-screen rv-phone">
      <p className={myTurn ? 'rv-status mine' : 'rv-status'}>
        {over
          ? over.text
          : me < 0
            ? `${turnName} to play`
            : myTurn
              ? 'your turn — tap a dotted square'
              : `${turnName} is thinking…`}
      </p>
      {/* the skip line is always here, empty or not: a line appearing above the
          board would shove it down under the finger already aiming at it */}
      <p className="rv-skip">
        {view.skipped === null || over
          ? ' '
          : view.skipped === me
            ? '⏭ no move for you — turn skipped'
            : `⏭ ${names[view.skipped === 0 ? 0 : 1]} had no move — skipped`}
      </p>
      <Board
        view={view}
        idle={!myTurn}
        onPlace={myTurn ? (x, y) => move('place', x, y) : undefined}
      />
      <Score view={view} names={names} over={!!over} />
    </div>
  );
}
