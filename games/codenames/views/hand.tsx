import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CodenamesView } from '../game.js';
import { Board, TeamChips, TurnBanner } from './parts.js';

export default function HandView({ view, over, move }: GameViewProps<CodenamesView>) {
  const myTurn = view.myTeam === null || view.myTeam === view.turn;
  return (
    <div className="cn-screen cn-phone">
      <TeamChips view={view} />
      {view.myTeam && (
        <p className="cn-myteam">
          you guess for {view.myTeam === 'red' ? '🔴 red' : '🔵 blue'}
        </p>
      )}
      {over ? (
        <p className="cn-over">{over.text}</p>
      ) : (
        <TurnBanner
          view={view}
          suffix={myTurn ? "tap your team's guess" : 'wait for your turn'}
        />
      )}
      <Board view={view} mini onGuess={myTurn ? (i) => move('guess', i) : undefined} />
      {!over && myTurn && (
        <button className="cn-endturn" onClick={() => move('endTurn')}>
          End {view.turn} turn
        </button>
      )}
    </div>
  );
}
