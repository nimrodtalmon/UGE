import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CodenamesView } from '../game.js';
import { Board, TeamChips, TurnBanner } from './parts.js';

export default function HandView({ view, over, move }: GameViewProps<CodenamesView>) {
  return (
    <div className="cn-screen cn-phone">
      <TeamChips view={view} />
      {over ? (
        <p className="cn-over">{over.text}</p>
      ) : (
        <TurnBanner view={view} suffix="tap your team's guess" />
      )}
      <Board view={view} mini onGuess={(i) => move('guess', i)} />
      {!over && (
        <button className="cn-endturn" onClick={() => move('endTurn')}>
          End {view.turn} turn
        </button>
      )}
    </div>
  );
}
