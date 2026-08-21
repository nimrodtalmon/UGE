import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { DbView } from '../game.js';
import { Board, Score } from './parts.js';

export default function HandView({ view, players, over, move }: GameViewProps<DbView>) {
  const me = view.myIndex;
  const myTurn = !over && me >= 0 && view.turn === me;
  useTurnBuzz(myTurn);
  const names: [string, string] = [
    players[0]?.name ?? view.names[0],
    players[1]?.name ?? view.names[1],
  ];
  const turnName = names[view.turn === 0 ? 0 : 1];

  const status = over
    ? over.text
    : me < 0
      ? `${turnName} to draw`
      : myTurn
        ? view.again
          ? '🔁 box closed — go again!'
          : 'your turn — tap a gap'
        : `${turnName} is thinking…`;

  const note = over
    ? ''
    : view.again && !myTurn
      ? `${turnName} closed a box and plays on`
      : myTurn
        ? 'a fourth side wins you the box — and another go'
        : '';

  return (
    <div className="db-screen db-phone">
      <p className={myTurn ? 'db-status db-mine' : 'db-status'}>{status}</p>
      {/* always rendered: a line appearing above the board would shove every
          gap down, right as one is about to be tapped */}
      <p className="db-note">{note || ' '}</p>
      <Board
        view={view}
        names={names}
        onDraw={myTurn ? (e) => move('draw', e) : undefined}
      />
      <Score view={view} names={names} over={!!over} />
    </div>
  );
}
