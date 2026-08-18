import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { ChessView } from '../game.js';
import { Board } from './Board.js';

export default function TableView({ view, over }: GameViewProps<ChessView>) {
  return (
    <div className="ch-screen">
      <p className="ch-status">
        {over
          ? over.text
          : `${view.turn === 'w' ? '⚪' : '⚫'} ${view.names[view.turn === 'w' ? 0 : 1]} to move${view.check ? ' — check!' : ''}`}
      </p>
      <Board view={view} flipped={false} big />
      <p className="ch-names muted-line">
        ⚪ {view.names[0]} vs ⚫ {view.names[1]}
      </p>
    </div>
  );
}
