import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import { SIZE } from '../game.js';
import type { BsView } from '../game.js';
import { BoardGrid, FleetTicker } from './parts.js';

export default function HandView({ view, players, over, move }: GameViewProps<BsView>) {
  const my = view.myIndex === 1 ? 1 : 0;
  const opp = my === 0 ? 1 : 0;
  const myBoard = view.boards[my];
  const oppBoard = view.boards[opp];
  const oppName = players[opp]?.name ?? view.names[opp];
  const myTurn = !over && view.phase === 'play' && view.current === my;
  useTurnBuzz(myTurn);

  const lastOn = (board: number): number | null =>
    view.lastShot && view.lastShot.board === board
      ? view.lastShot.y * SIZE + view.lastShot.x
      : null;

  if (view.phase === 'place') {
    return (
      <div className="bs-screen bs-phone">
        <p className="bs-status">
          {view.ready[my]
            ? `Anchored — waiting for ${oppName}…`
            : 'Your fleet — shuffle until it feels lucky'}
        </p>
        <BoardGrid board={myBoard} last={null} />
        <FleetTicker board={myBoard} />
        <div className="bs-actions">
          <button
            className="bs-btn"
            disabled={view.ready[my]}
            onClick={() => move('shuffle')}
          >
            🔀 Shuffle
          </button>
          <button
            className="bs-btn primary"
            disabled={view.ready[my]}
            onClick={() => move('ready')}
          >
            {view.ready[my] ? '⚓ Ready ✓' : '⚓ Ready'}
          </button>
        </div>
        <p className="bs-muted">
          {view.ready[opp] ? `${oppName} is ready` : `${oppName} is still placing…`}
        </p>
      </div>
    );
  }

  return (
    <div className="bs-screen bs-phone">
      <p className={myTurn ? 'bs-status mine' : 'bs-status'}>
        {over ? over.text : myTurn ? 'Your shot — tap a square! 🎯' : `${oppName} is aiming…`}
      </p>

      <div className="bs-section">
        <h3 className="bs-label">🎯 Target — {oppName}'s sea</h3>
        <BoardGrid
          board={oppBoard}
          onFire={(x, y) => move('fire', x, y)}
          disabled={!myTurn}
          last={lastOn(opp)}
        />
        <FleetTicker board={oppBoard} />
      </div>

      <div className="bs-section">
        <h3 className="bs-label">🛡 My sea</h3>
        <BoardGrid board={myBoard} last={lastOn(my)} />
        <FleetTicker board={myBoard} />
      </div>
    </div>
  );
}
