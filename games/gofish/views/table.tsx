import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { rankLabel } from '../game.js';
import type { GoFishView } from '../game.js';
import { AskLog, BookStrip, Seats, nameOf } from './parts.js';

/** Display only: the public half of the game, big enough to read across a room. */
export default function TableView({ view, players, over }: GameViewProps<GoFishView>) {
  const last = view.log[view.log.length - 1];
  const status = over ? over.text : `${nameOf(view, players, view.turn)} is asking…`;
  const beat = last
    ? last.got > 0
      ? `${nameOf(view, players, last.asker)} took ${last.got} ${rankLabel(last.rank)}${last.got > 1 ? 's' : ''} from ${nameOf(view, players, last.target)}`
      : last.drewMatch
        ? `${nameOf(view, players, last.asker)} went fishing and landed the ${rankLabel(last.rank)}`
        : `${nameOf(view, players, last.target)} told ${nameOf(view, players, last.asker)} to go fish`
    : 'the pond is open';

  return (
    <div className="gf-screen gf-table">
      <Seats view={view} players={players} />
      <p className="gf-status big">{status}</p>
      <p className="gf-beat big">{over ? '' : beat}</p>
      <div className="gf-tally big">
        <span>🐟 pond {view.pondCount}</span>
        <span>📕 books {view.booksMade}/13</span>
      </div>
      <BookStrip view={view} players={players} />
      <AskLog view={view} players={players} />
    </div>
  );
}
