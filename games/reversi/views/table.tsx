import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { RvView } from '../game.js';
import { Board, Score } from './Board.js';

export default function TableView({ view, players, over }: GameViewProps<RvView>) {
  const names: [string, string] = [
    players[0]?.name ?? view.names[0],
    players[1]?.name ?? view.names[1],
  ];
  return (
    <div className="rv-screen">
      <p className="rv-status">
        {over
          ? over.text
          : `${view.current === 0 ? '⚫' : '⚪'} ${names[view.current === 0 ? 0 : 1]} to play`}
      </p>
      <p className="rv-skip">
        {view.skipped === null || over
          ? ' '
          : `⏭ ${names[view.skipped === 0 ? 0 : 1]} had no move — skipped`}
      </p>
      <Board view={view} big />
      <Score view={view} names={names} over={!!over} />
    </div>
  );
}
