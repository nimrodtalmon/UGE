import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CkView } from '../game.js';
import { Board } from './Board.js';

/** Display only — the table never plays a move. */
export default function TableView({ view, over }: GameViewProps<CkView>) {
  const status = over
    ? over.text
    : `${view.turn === 0 ? '🔴' : '⚫'} ${view.names[view.turn]} to move`;
  const note = over
    ? ''
    : view.chain !== null
      ? 'multi-jump in progress'
      : view.mustCapture
        ? 'a capture is forced'
        : view.lastMove?.crowned
          ? 'crowned 👑'
          : '';
  return (
    <div className="ck-screen">
      <p className="ck-status">{status}</p>
      {/* always rendered: the note comes and goes each turn and would jog the board */}
      <p className="ck-note">{note || ' '}</p>
      <Board view={view} flipped={false} big />
      <p className="ck-tally">
        🔴 {view.names[0]} · {view.left[0]} left&ensp;vs&ensp;⚫ {view.names[1]} · {view.left[1]} left
      </p>
    </div>
  );
}
