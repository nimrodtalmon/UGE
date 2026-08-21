import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CodenamesView } from '../game.js';
import { Board, TeamChips, TurnBanner } from './parts.js';

export default function HandView({ view, over, move }: GameViewProps<CodenamesView>) {
  const myTurn = view.myTeam === null || view.myTeam === view.turn;
  return (
    <div className="cn-screen cn-phone">
      <TeamChips view={view} />
      {/* always rendered: a line appearing above the grid would slide the words
          down under the finger already reaching for one */}
      <p className="cn-myteam">
        {view.myTeam ? `you guess for ${view.myTeam === 'red' ? '🔴 red' : '🔵 blue'}` : ' '}
      </p>
      {over ? (
        <p className="cn-over">{over.text}</p>
      ) : (
        <TurnBanner
          view={view}
          suffix={
            myTurn
              ? "tap your team's guess"
              : 'your board is locked until they finish'
          }
        />
      )}
      {/* dimmed, not hidden: the other team's guesses are the whole point of
          watching, but the cards must not look tappable while they are not */}
      <div className={myTurn || over ? 'cn-boardwrap' : 'cn-boardwrap locked'}>
        <Board view={view} mini onGuess={myTurn ? (i) => move('guess', i) : undefined} />
      </div>
      {/* the slot stays even when the button is hidden — the column is centred,
          so a button popping in would re-centre the grid mid-guess */}
      <div className="cn-endturn-slot">
        {!over && myTurn && (
          <button className="cn-endturn" onClick={() => move('endTurn')}>
            End {view.turn} turn
          </button>
        )}
      </div>
    </div>
  );
}
