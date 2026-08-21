import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { C4View } from '../game.js';
import { Board, Legend } from './Board.js';

export default function TableView({ view, players, over }: GameViewProps<C4View>) {
  const names: [string, string] = [
    players[0]?.name ?? view.names[0],
    players[1]?.name ?? view.names[1],
  ];
  return (
    <div className="c4-screen">
      <p className="c4-status">
        {over ? over.text : `${names[view.current === 0 ? 0 : 1]} to drop`}
      </p>
      <Board view={view} big />
      <Legend view={view} names={names} />
    </div>
  );
}
