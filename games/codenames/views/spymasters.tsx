import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CodenamesView } from '../game.js';
import { Board, TeamChips, TurnBanner } from './parts.js';

/** The shared key-card device — both spymasters look at this one screen. */
export default function Spymasters({ view, over }: GameViewProps<CodenamesView>) {
  return (
    <div className="cn-screen cn-phone">
      <p className="cn-role">🤫 The spymasters' map — keep it away from the guessers</p>
      <TeamChips view={view} />
      {over ? (
        <p className="cn-over">{over.text}</p>
      ) : (
        <TurnBanner
          view={view}
          suffix={`${view.turn} spymaster, give your clue: one word + a number`}
        />
      )}
      <Board view={view} mini />
    </div>
  );
}
