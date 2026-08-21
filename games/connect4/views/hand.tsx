import './style.css';
import { useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { C4View } from '../game.js';
import { Board, Legend } from './Board.js';

export default function HandView({ view, players, over, move }: GameViewProps<C4View>) {
  const [hover, setHover] = useState<number | null>(null);
  const me = view.myIndex;
  const myTurn = !over && me >= 0 && view.current === me;
  useTurnBuzz(myTurn);
  const names: [string, string] = [
    players[0]?.name ?? view.names[0],
    players[1]?.name ?? view.names[1],
  ];
  const theirName = names[view.current === 0 ? 0 : 1];

  return (
    <div className="c4-screen c4-phone">
      <p className={myTurn ? 'c4-status mine' : 'c4-status'}>
        {over
          ? over.text
          : me < 0
            ? `${theirName} to drop`
            : myTurn
              ? 'your turn — tap a column'
              : `${theirName} is thinking…`}
      </p>
      <Board
        view={view}
        ghost={myTurn ? hover : null}
        ghostSeat={me < 0 ? 0 : me}
        onHover={myTurn ? setHover : undefined}
        onDrop={myTurn ? (col) => move('drop', col) : undefined}
      />
      <Legend view={view} names={names} />
    </div>
  );
}
