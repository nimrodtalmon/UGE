import './style.css';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { BASE, HOME, RING, SAFE, destinationOf, occupantsOf, ringSquare } from '../game.js';
import type { LudoView } from '../game.js';
import { Board, Die, Seats, nameOf } from './board.js';

/** What tapping this token would do, in two or three words. */
function labelFor(view: LudoView, index: number): string {
  const die = view.die ?? 0;
  const from = view.tokens[view.myIndex]?.[index] ?? BASE;
  const to = destinationOf(view, view.turn, index, die);
  if (to === null) return '';
  if (to === HOME) return 'home! 🏁';
  if (from === BASE) return 'come out';
  if (to >= RING) return 'up the lane';
  const square = ringSquare(view.colours[view.turn] ?? 0, to);
  if (!SAFE.includes(square) && occupantsOf(view, square, view.turn).length > 0) return 'send home 💥';
  if (SAFE.includes(square)) return `walk ${die} ★`;
  return `walk ${die}`;
}

export default function HandView({ view, players, over, move }: GameViewProps<LudoView>) {
  const mine = view.myIndex >= 0 && view.turn === view.myIndex && view.winner === null && !over;
  const myRoll = mine && view.phase === 'roll';
  const myMove = mine && view.phase === 'move';
  useTurnBuzz(mine);

  const watching = view.myIndex < 0;
  const status = over
    ? over.text
    : watching
      ? `${nameOf(view, players, view.turn)} to play — you're watching`
      : myRoll
        ? 'your turn — throw the die'
        : myMove
          ? `you rolled ${view.die} — pick a token`
          : view.phase === 'move'
            ? `${nameOf(view, players, view.turn)} rolled ${view.die}…`
            : `${nameOf(view, players, view.turn)} is throwing…`;

  return (
    <div className="ld-screen ld-phone">
      <Seats view={view} players={players} />

      <p className={mine ? 'ld-status mine' : 'ld-status'}>{status}</p>
      <p className="ld-note">{over ? '' : (view.note ?? '')}</p>

      <Board view={view} onToken={(i) => move('moveToken', i)} />

      <div className="ld-action">
        {myRoll ? (
          <button className="ld-roll" onClick={() => move('roll')}>
            <Die n={view.die} /> Roll
          </button>
        ) : myMove ? (
          <div className="ld-picks">
            <Die n={view.die} />
            {view.legal.map((i) => (
              <button
                key={i}
                className={`ld-pick q${view.colours[view.myIndex] ?? 0}`}
                onClick={() => move('moveToken', i)}
              >
                <span className="ld-pickdot" />
                <span className="ld-picktext">{labelFor(view, i)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="ld-waiting">
            <Die n={view.die} />
            <span className="ld-waittext">
              {over ? 'game over' : `${nameOf(view, players, view.turn)}'s turn`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
