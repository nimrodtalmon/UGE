import { avatarFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import { RED, rankLabel, SUITS, type BCard } from '../cards.js';
import type { BjHandView, BjSeatView, BjView } from '../game.js';

export function CardFace({ card, big }: { card: BCard | null; big?: boolean }) {
  const size = big ? ' big' : '';
  if (!card) return <span className={`bj-card back${size}`}>✦</span>;
  const red = RED.includes(card.s);
  return (
    <span className={`bj-card${red ? ' red' : ''}${size}`}>
      <span className="bj-rank">{rankLabel(card.r)}</span>
      <span className="bj-suit">{SUITS[card.s]}</span>
    </span>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  blackjack: 'BJ 3:2',
  win: 'win',
  push: 'push',
  lose: 'lose',
};

export function totalLabel(hand: BjHandView): string {
  if (hand.bust) return `bust ${hand.value}`;
  if (hand.natural) return 'blackjack!';
  return hand.soft && hand.value <= 21 ? `${hand.value} soft` : String(hand.value);
}

export function HandBox({
  hand,
  big,
  live,
}: {
  hand: BjHandView;
  big?: boolean;
  /** The hand currently being played — gets the ring. */
  live?: boolean;
}) {
  const cls = ['bj-hand'];
  if (live) cls.push('live');
  if (hand.bust) cls.push('bust');
  return (
    <div className={cls.join(' ')}>
      <div className="bj-cards">
        {hand.cards.map((c, i) => (
          <CardFace key={i} card={c} big={big} />
        ))}
      </div>
      <div className="bj-handfoot">
        <span className={hand.bust ? 'bj-total bust' : 'bj-total'}>{totalLabel(hand)}</span>
        <span className="bj-stake">
          {hand.bet}💰{hand.doubled ? ' ×2' : ''}
        </span>
        {hand.outcome && <span className={`bj-outcome ${hand.outcome}`}>{OUTCOME_LABEL[hand.outcome]}</span>}
      </div>
    </div>
  );
}

/** The house. Its second card is simply not there until it turns it over. */
export function Dealer({ view, big }: { view: BjView; big?: boolean }) {
  const d = view.dealer;
  const label = d.hidden
    ? `showing ${d.value}`
    : d.cards.length === 0
      ? 'waiting for bets'
      : d.natural
        ? 'blackjack!'
        : d.bust
          ? `bust ${d.value}`
          : String(d.value);
  return (
    <div className="bj-dealerbox">
      <span className="bj-dealerlabel">🎩 Dealer</span>
      <div className="bj-cards">
        {d.cards.map((c, i) => (
          <CardFace key={i} card={c} big={big} />
        ))}
        {d.hidden && <CardFace card={null} big={big} />}
        {d.cards.length === 0 && <CardFace card={null} big={big} />}
      </div>
      <span className={d.bust ? 'bj-total bust' : 'bj-total'}>{label}</span>
    </div>
  );
}

export function nameOf(view: BjView, players: PlayerInfo[], i: number): string {
  return players[i]?.name ?? view.seats[i]?.name ?? '…';
}

/** A compact chip line per seat — used on phones for everyone else. */
export function SeatChips({ view, players, hideIndex }: { view: BjView; players: PlayerInfo[]; hideIndex?: number }) {
  return (
    <div className="bj-chipsrow">
      {view.seats.map((seat, i) =>
        i === hideIndex ? null : (
          <span key={i} className={i === view.turn ? 'bj-chip current' : 'bj-chip'}>
            <span className="bj-avatar">{players[i]?.avatar ?? avatarFor(seat.name)}</span>
            <span className="bj-chipname">{nameOf(view, players, i)}</span>
            <span className="bj-chipcount">{seat.chips}💰</span>
            {seat.hands.length > 0 && <span className="bj-chiptotal">{seat.hands.map((h) => totalLabel(h)).join(' / ')}</span>}
            {view.phase === 'bets' && seat.ready && <span className="bj-ready">bet {seat.bet}</span>}
          </span>
        ),
      )}
    </div>
  );
}

/** Full seat panel — the table screen's view of one player. */
export function SeatPanel({
  view,
  players,
  index,
}: {
  view: BjView;
  players: PlayerInfo[];
  index: number;
}) {
  const seat: BjSeatView | undefined = view.seats[index];
  if (!seat) return null;
  const cls = ['bj-seat'];
  if (index === view.turn) cls.push('current');
  if (seat.broke) cls.push('broke');
  return (
    <div className={cls.join(' ')}>
      <div className="bj-seathead">
        <span className="bj-avatar">{players[index]?.avatar ?? avatarFor(seat.name)}</span>
        <span className="bj-chipname">{nameOf(view, players, index)}</span>
        <span className="bj-chipcount">{seat.chips}💰</span>
      </div>
      <div className="bj-seathands">
        {seat.hands.map((h, i) => (
          <HandBox key={i} hand={h} live={index === view.turn && i === seat.active} />
        ))}
        {seat.hands.length === 0 && (
          <span className="bj-waiting">
            {seat.broke ? 'out of chips' : view.phase === 'bets' ? (seat.ready ? `bet ${seat.bet} ✓` : 'betting…') : 'sitting out'}
          </span>
        )}
      </div>
      {seat.net !== 0 && view.phase === 'payout' && (
        <span className={seat.net > 0 ? 'bj-net up' : 'bj-net down'}>
          {seat.net > 0 ? '+' : ''}
          {seat.net}
        </span>
      )}
    </div>
  );
}
