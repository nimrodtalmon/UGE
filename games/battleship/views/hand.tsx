import './style.css';
import { useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import { SIZE, allPlaced } from '../game.js';
import type { BsView } from '../game.js';
import { BoardGrid, FleetTicker, PlaceArea, canRotate } from './parts.js';

export default function HandView({ view, players, over, move }: GameViewProps<BsView>) {
  const my = view.myIndex === 1 ? 1 : 0;
  const opp = my === 0 ? 1 : 0;
  const myBoard = view.boards[my];
  const oppBoard = view.boards[opp];
  const oppName = players[opp]?.name ?? view.names[opp];
  const myTurn = !over && view.phase === 'play' && view.current === my;
  useTurnBuzz(myTurn);

  // place phase: which hull is in hand, and how a tray hull will lie
  const [sel, setSel] = useState<number | null>(0);
  const [horiz, setHoriz] = useState(true);
  // play phase: a deliberate peek at the other sea, forgotten when the turn changes
  const [peek, setPeek] = useState<{ turn: number; target: boolean } | null>(null);

  const lastOn = (board: number): number | null =>
    view.lastShot && view.lastShot.board === board
      ? view.lastShot.y * SIZE + view.lastShot.x
      : null;

  if (view.phase === 'place') {
    const fleet = view.myFleet ?? [];
    const locked = view.ready[my];
    const done = fleet.length > 0 && allPlaced(fleet);
    const left = fleet.filter((s) => !s.placed).length;
    const ship = sel !== null ? fleet[sel] : undefined;

    const rotate = (): void => {
      if (!ship || sel === null) return;
      if (ship.placed) move('placeShip', sel, ship.x, ship.y, !ship.horizontal);
      else setHoriz(!horiz); // a tray hull just changes how it will land
    };

    /** After a hull leaves the tray, hand the player the next one automatically. */
    const place = (i: number, x: number, y: number, horizontal: boolean): void => {
      const wasWaiting = fleet[i]?.placed === false;
      move('placeShip', i, x, y, horizontal);
      if (!wasWaiting) return;
      const next = fleet.findIndex((s, k) => k !== i && !s.placed);
      setSel(next === -1 ? i : next);
    };

    return (
      <div className="bs-screen bs-phone">
        <p className="bs-status">
          {locked
            ? `Anchored — waiting for ${oppName}…`
            : ship && !ship.placed
              ? `${ship.name} (${ship.size}) — drop it on the sea`
              : ship
                ? `${ship.name} — drag it, or tap ↻ to turn it`
                : done
                  ? 'Fleet ready — weigh anchor!'
                  : `Place your fleet — ${left} to go`}
        </p>

        <PlaceArea
          fleet={fleet}
          sel={sel}
          onSel={setSel}
          horiz={horiz}
          onRotate={rotate}
          onPlace={place}
          locked={locked}
        />

        <div className="bs-actions">
          <button className="bs-btn" disabled={locked || !canRotate(fleet, sel)} onClick={rotate}>
            ↻ Rotate
          </button>
          <button
            className="bs-btn primary"
            disabled={locked || !done}
            onClick={() => move('ready')}
          >
            {locked ? '⚓ Ready ✓' : '⚓ Ready'}
          </button>
        </div>

        <p className="bs-muted">
          {!locked && !done ? (
            <button
              className="bs-quiet"
              onClick={() => {
                setSel(null);
                move('autoPlace');
              }}
            >
              place the rest for me
            </button>
          ) : view.ready[opp] ? (
            `${oppName} is ready`
          ) : (
            `${oppName} is still placing… ${view.placedCount[opp]}/${fleet.length || 5}`
          )}
        </p>
      </div>
    );
  }

  // One sea at a time, and by default the one that matters right now: the
  // target grid on your turn, your own waters while the other player aims.
  const target = peek && peek.turn === view.current ? peek.target : myTurn || !!over;
  const seat = target ? opp : my;

  return (
    <div className="bs-screen bs-phone bs-play">
      <p className={myTurn ? 'bs-status mine' : 'bs-status'}>
        {over
          ? over.text
          : target
            ? myTurn
              ? 'Your shot — tap a square! 🎯'
              : `Peeking at ${oppName}'s sea`
            : myTurn
              ? 'Peeking at your own sea'
              : `${oppName} is aiming… ⏳`}
      </p>

      <div className="bs-section">
        <h3 className="bs-label">{target ? `🎯 ${oppName}'s sea` : '🛡 Your sea'}</h3>
        <BoardGrid
          board={view.boards[seat]}
          hero
          onFire={target ? (x, y) => move('fire', x, y) : undefined}
          disabled={!myTurn}
          last={lastOn(seat)}
        />
        <FleetTicker board={target ? oppBoard : myBoard} />
      </div>

      <div className="bs-switch">
        <button
          className={target ? 'on' : ''}
          onClick={() => setPeek({ turn: view.current, target: true })}
        >
          🎯 Target
        </button>
        <button
          className={target ? '' : 'on'}
          onClick={() => setPeek({ turn: view.current, target: false })}
        >
          🛡 My sea
        </button>
      </div>
    </div>
  );
}
