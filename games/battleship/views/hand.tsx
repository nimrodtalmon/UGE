import './style.css';
import { useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import { SIZE } from '../game.js';
import type { BsView } from '../game.js';
import { BoardGrid, FleetStrip, FleetTicker, PlaceBoard, canRotate } from './parts.js';

export default function HandView({ view, players, over, move }: GameViewProps<BsView>) {
  const my = view.myIndex === 1 ? 1 : 0;
  const opp = my === 0 ? 1 : 0;
  const myBoard = view.boards[my];
  const oppBoard = view.boards[opp];
  const oppName = players[opp]?.name ?? view.names[opp];
  const myTurn = !over && view.phase === 'play' && view.current === my;
  useTurnBuzz(myTurn);

  const [sel, setSel] = useState<number | null>(null);
  // which sea gets the big board; the other one rides along as a minimap
  const [aiming, setAiming] = useState(true);

  const lastOn = (board: number): number | null =>
    view.lastShot && view.lastShot.board === board
      ? view.lastShot.y * SIZE + view.lastShot.x
      : null;

  if (view.phase === 'place') {
    const fleet = view.myFleet ?? [];
    const locked = view.ready[my];
    const ship = sel !== null ? fleet[sel] : undefined;
    const rotate = (): void => {
      if (ship && sel !== null) move('placeShip', sel, ship.x, ship.y, !ship.horizontal);
    };
    return (
      <div className="bs-screen bs-phone">
        <p className="bs-status">
          {locked
            ? `Anchored — waiting for ${oppName}…`
            : ship
              ? `${ship.name} — drop its bow on a square, or drag it`
              : 'Tap a ship to move it, or just hit Ready'}
        </p>
        <FleetStrip fleet={fleet} sel={sel} onSel={setSel} locked={locked} />
        <PlaceBoard
          fleet={fleet}
          sel={sel}
          onSel={setSel}
          onPlace={(i, x, y, horizontal) => move('placeShip', i, x, y, horizontal)}
          locked={locked}
        />
        <div className="bs-actions">
          <button
            className="bs-btn"
            disabled={locked || !canRotate(fleet, sel)}
            onClick={rotate}
          >
            ↻ Rotate
          </button>
          <button
            className="bs-btn"
            disabled={locked}
            onClick={() => {
              setSel(null);
              move('shuffle');
            }}
          >
            🔀 Shuffle
          </button>
          <button className="bs-btn primary" disabled={locked} onClick={() => move('ready')}>
            {locked ? '⚓ Ready ✓' : '⚓ Ready'}
          </button>
        </div>
        <p className="bs-muted">
          {view.ready[opp] ? `${oppName} is ready` : `${oppName} is still placing…`}
        </p>
      </div>
    );
  }

  const heroSeat = aiming ? opp : my;
  const miniSeat = aiming ? my : opp;
  const miniLabel = aiming ? '🛡 My sea' : '🎯 Target';

  return (
    <div className="bs-screen bs-phone bs-play">
      <div className="bs-topbar">
        {/* the other sea, small but marked — no scrolling to check it */}
        <div className="bs-mini-wrap" onClick={() => setAiming(!aiming)}>
          <span className="bs-mini-label">{miniLabel}</span>
          <BoardGrid board={view.boards[miniSeat]} mini last={lastOn(miniSeat)} />
        </div>
        <div className="bs-topinfo">
          <p className={myTurn ? 'bs-status mine' : 'bs-status'}>
            {over ? over.text : myTurn ? 'Your shot — tap a square! 🎯' : `${oppName} is aiming…`}
          </p>
          <div className="bs-switch">
            <button className={aiming ? 'on' : ''} onClick={() => setAiming(true)}>
              🎯 Target
            </button>
            <button className={aiming ? '' : 'on'} onClick={() => setAiming(false)}>
              🛡 My sea
            </button>
          </div>
        </div>
      </div>

      <div className="bs-section bs-heroblock">
        <h3 className="bs-label">
          {aiming ? `🎯 Target — ${oppName}'s sea` : '🛡 My sea'}
        </h3>
        <BoardGrid
          board={view.boards[heroSeat]}
          hero
          onFire={aiming ? (x, y) => move('fire', x, y) : undefined}
          disabled={!myTurn}
          last={lastOn(heroSeat)}
        />
        <FleetTicker board={aiming ? oppBoard : myBoard} />
      </div>
    </div>
  );
}
