import './style.css';
import type { CSSProperties } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { colorFor } from '../../../src/shared/avatar.js';
import type { SetView } from '../game.js';
import { FLASH_MS } from '../game.js';
import { Board } from './board.js';
import { SetDefs } from './card.js';

/** Display only — the table never plays a card, it just shows the same table. */
export default function TableView({ view, players, over, serverNow }: GameViewProps<SetView>) {
  const claim = view.lastClaim;
  const fresh = claim !== null && serverNow - claim.at < FLASH_MS + 1_200;
  const wrong =
    fresh && claim !== null && !claim.ok
      ? view.board.flatMap((c, i) => (c !== null && claim.cards.includes(c) ? [i] : []))
      : [];

  const banner = (): string => {
    if (over) return over.text;
    if (fresh && claim !== null) {
      const who = view.names[claim.seat] ?? 'Someone';
      return claim.ok ? `${who} took a set ✓` : `${who} called it wrong ✗`;
    }
    return 'Everyone plays at once — tap three on your phone';
  };

  return (
    <div className="st-screen st-table">
      <SetDefs />
      <div className="st-hud big">
        {view.names.map((name, i) => (
          <div key={i} className="st-seat" style={{ '--seat': colorFor(i) } as CSSProperties}>
            <span className="st-av">{players[i]?.avatar ?? '🙂'}</span>
            <span className="st-who">{players[i]?.name ?? name}</span>
            <strong>{view.scores[i] ?? 0}</strong>
          </div>
        ))}
      </div>

      <p className={`st-status${over ? ' done' : ''}`}>{banner()}</p>

      <div className="st-boardwrap">
        <Board board={view.board} selected={[]} wrong={wrong} locked shape="table" />
      </div>

      <p className="st-foot">{view.deckLeft} cards left in the deck</p>
    </div>
  );
}
