import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { SolView } from '../game.js';
import { Board } from './parts.js';

/** Display-only: the same board, larger, with no gameplay handlers. */
export default function TableView({ view, players, over }: GameViewProps<SolView>) {
  const home = view.foundations.reduce((sum, f) => sum + f.length, 0);
  return (
    <div className="sol-screen">
      <h1 className="sol-title">Solitaire</h1>
      <p className={over ? 'sol-status won' : view.stuck ? 'sol-status stuck' : 'sol-status'}>
        {over
          ? over.text
          : view.stuck
            ? 'no moves left — deal again on the phone'
            : `${players[0]?.name ?? 'playing'} · ${view.moves} moves · ${home}/52 home`}
      </p>
      <Board view={view} big />
    </div>
  );
}
