import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { DbView } from '../game.js';
import { Board, Score } from './parts.js';

/** Display only — the table never draws a line. */
export default function TableView({ view, players, over }: GameViewProps<DbView>) {
  const names: [string, string] = [
    players[0]?.name ?? view.names[0],
    players[1]?.name ?? view.names[1],
  ];
  const turnName = names[view.turn === 0 ? 0 : 1];

  return (
    <div className="db-screen">
      <p className="db-status">{over ? over.text : `${turnName} to draw`}</p>
      {/* always rendered: the note comes and goes each turn and would jog the board */}
      <p className="db-note">
        {over ? ' ' : view.again ? `${turnName} closed a box and plays on` : ' '}
      </p>
      <Board view={view} names={names} big />
      <Score view={view} names={names} over={!!over} />
    </div>
  );
}
