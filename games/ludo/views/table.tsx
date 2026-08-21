import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { LudoView } from '../game.js';
import { Board, Die, Seats, nameOf } from './board.js';

/** Display only: the table shows the board, the phones do the tapping. */
export default function TableView({ view, players, over }: GameViewProps<LudoView>) {
  const status = over
    ? over.text
    : view.phase === 'move'
      ? `${nameOf(view, players, view.turn)} rolled ${view.die} — picking a token…`
      : `${nameOf(view, players, view.turn)} is throwing…`;

  return (
    <div className="ld-screen">
      <Seats view={view} players={players} />
      <p className="ld-status big">{status}</p>
      <p className="ld-note big">{over ? '' : (view.note ?? '')}</p>
      <Board view={view} big />
      <div className="ld-action">
        <div className="ld-waiting">
          <Die n={view.die} />
          <span className="ld-waittext">
            {over ? 'game over' : `${nameOf(view, players, view.turn)}'s turn`}
          </span>
        </div>
      </div>
    </div>
  );
}
