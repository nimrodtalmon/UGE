import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CodenamesView } from '../game.js';
import { Board, TeamChips, TurnBanner } from './parts.js';

/** The shared key-card device — both spymasters look at this one screen.
    In one-shared-phone mode it also records the shouted guesses. */
export default function Spymasters({ view, over, move }: GameViewProps<CodenamesView>) {
  return (
    <div className="cn-screen cn-phone">
      <p className="cn-role">
        {view.solo
          ? '🤫 The spymasters’ map — tap the words the guessers shout'
          : '🤫 The spymasters’ map — keep it away from the guessers'}
      </p>
      <TeamChips view={view} />
      {over ? (
        <p className="cn-over">{over.text}</p>
      ) : (
        <TurnBanner
          view={view}
          suffix={
            view.solo
              ? `${view.turn} spymaster clues aloud — guessers shout, you tap`
              : `${view.turn} spymaster, give your clue: one word + a number`
          }
        />
      )}
      <Board view={view} mini onGuess={view.solo ? (i) => move('guess', i) : undefined} />
      {view.solo && !over && (
        <button className="cn-endturn" onClick={() => move('endTurn')}>
          End {view.turn} turn
        </button>
      )}
    </div>
  );
}
