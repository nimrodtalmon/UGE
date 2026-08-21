import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { DomView } from '../game.js';
import { Chain, nameOf, OpenEnds, Seats } from './parts.js';

/** Display only: the line, the open ends and who is holding what. */
export default function TableView({ view, players, over }: GameViewProps<DomView>) {
  return (
    <div className="dom-screen">
      <Seats view={view} players={players} />
      <Chain view={view} size="big" />
      <OpenEnds view={view} />
      {/* one status slot, reserved: the result line wraps where "X's turn" does not */}
      <div className="dom-statusbox">
        {over ? (
          <p className="dom-over">{over.text}</p>
        ) : (
          <p className="dom-status">
            {nameOf(view, players, view.turn)}'s turn
            <span className="dom-last">{' · '}{view.lastAction}</span>
          </p>
        )}
      </div>
    </div>
  );
}
