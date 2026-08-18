import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CodenamesView, Team } from '../game.js';
import { Board, TeamChips, TurnBanner } from './parts.js';

/** Shared screen for both spymaster roles — sees the full key card. */
export function Spymaster({ team, props }: { team: Team; props: GameViewProps<CodenamesView> }) {
  const { view, over } = props;
  return (
    <div className="cn-screen cn-phone">
      <p className={`cn-role ${team}`}>
        🤫 You are the {team === 'red' ? '🔴 RED' : '🔵 BLUE'} spymaster
      </p>
      <TeamChips view={view} />
      {over ? (
        <p className="cn-over">{over.text}</p>
      ) : (
        <TurnBanner
          view={view}
          suffix={view.turn === team ? 'give your clue: one word + a number' : 'wait quietly…'}
        />
      )}
      <Board view={view} mini />
      <p className="cn-hint-note">only you and the other spymaster see the colors</p>
    </div>
  );
}
