import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CodenamesView } from '../game.js';
import { Board, TeamChips, TurnBanner } from './parts.js';

export default function TableView({ view, over }: GameViewProps<CodenamesView>) {
  return (
    <div className="cn-screen">
      <TeamChips view={view} />
      {over ? (
        <p className="cn-over">{over.text}</p>
      ) : (
        <TurnBanner view={view} suffix="listen to your spymaster, tap on your phones" />
      )}
      <Board view={view} />
    </div>
  );
}
