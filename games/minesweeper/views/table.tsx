import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { MsView } from '../game.js';
import { Board, Header, useElapsed } from './parts.js';

export default function TableView({ view, me, players, over, serverNow }: GameViewProps<MsView>) {
  const elapsed = useElapsed(view, serverNow);
  const sweeper = me ?? players[0] ?? null;

  return (
    <div className="ms-screen">
      <h1 className="ms-title">Minesweeper</h1>
      <Header view={view} elapsed={elapsed} />
      <Board view={view} big />
      <p className={over ? 'ms-status over' : 'ms-status'}>
        {over
          ? over.text
          : view.startedAt === null
            ? `${sweeper ? `${sweeper.avatar} ${sweeper.name}` : 'the sweeper'} — tap anywhere to start`
            : `${view.mines - view.flags} mines left · play on your phone`}
      </p>
    </div>
  );
}
