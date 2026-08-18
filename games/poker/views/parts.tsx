import { avatarFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import { rankLabel, SUITS } from '../engine.js';
import type { PCard } from '../engine.js';
import type { PokerView } from '../game.js';

export function CardFace({ card, big }: { card: PCard | null; big?: boolean }) {
  if (!card) return <span className={`pk-card back${big ? ' big' : ''}`}>✦</span>;
  const red = card.s === 1 || card.s === 2;
  return (
    <span className={`pk-card${red ? ' red' : ''}${big ? ' big' : ''}`}>
      <span className="pk-rank">{rankLabel(card.r)}</span>
      <span className="pk-suit">{SUITS[card.s]}</span>
    </span>
  );
}

export function Seats({ view, players }: { view: PokerView; players: PlayerInfo[] }) {
  return (
    <div className="pk-seats">
      {view.seats.map((seat, i) => {
        const classes = ['pk-seat'];
        if (i === view.toAct) classes.push('current');
        if (seat.folded || seat.out) classes.push('folded');
        return (
          <div key={i} className={classes.join(' ')}>
            <span className="pk-avatar">{players[i]?.avatar ?? avatarFor(view.names[i] ?? '?')}</span>
            <span className="pk-name">
              {players[i]?.name ?? view.names[i]}
              {i === view.dealer && <span className="pk-dealer">D</span>}
            </span>
            <span className="pk-chips">{seat.chips}💰</span>
            {seat.streetBet > 0 && <span className="pk-bet">bet {seat.streetBet}</span>}
            {seat.out ? (
              <span className="pk-tag">out</span>
            ) : seat.folded ? (
              <span className="pk-tag">fold</span>
            ) : seat.allIn ? (
              <span className="pk-tag allin">all-in</span>
            ) : null}
            {seat.hole && (
              <span className="pk-mini-hole">
                {seat.hole.map((c, j) => (
                  <CardFace key={j} card={c} />
                ))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
