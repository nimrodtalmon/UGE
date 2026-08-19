import type { CSSProperties } from 'react';
import { avatarFor, colorFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import type { YahtzeeView } from '../game.js';
import { CATEGORIES, UPPER_TARGET, grandTotal, upperBonus, upperTotal } from '../scoring.js';
import type { Card } from '../scoring.js';

export const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Live identity for real seats; virtual "Player N" seats in pass mode stay as-is. */
export function seatName(view: YahtzeeView, players: PlayerInfo[], i: number): string {
  const live = view.pass ? undefined : players[i];
  return live?.name ?? view.playerNames[i] ?? `Player ${i + 1}`;
}

export function seatAvatar(view: YahtzeeView, players: PlayerInfo[], i: number): string {
  const live = view.pass ? undefined : players[i];
  return live?.avatar ?? avatarFor(view.playerNames[i] ?? `Player ${i + 1}`);
}

export function Dice(props: {
  dice: number[];
  held: boolean[];
  big?: boolean;
  /** Omit to render display-only dice (the table screen, waiting phones). */
  onToggle?: (i: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={props.big ? 'yz-dice big' : 'yz-dice'}>
      {props.dice.map((v, i) => {
        const cls = `yz-die${props.held[i] ? ' held' : ''}${v === 0 ? ' blank' : ''}`;
        const face = v === 0 ? '·' : DIE_FACES[v - 1];
        return props.onToggle ? (
          <button
            key={i}
            className={cls}
            disabled={props.disabled || v === 0}
            onClick={() => props.onToggle?.(i)}
          >
            {face}
          </button>
        ) : (
          <span key={i} className={cls}>
            {face}
          </span>
        );
      })}
    </div>
  );
}

/** Display-only scorecard: used boxes with points, open ones as dashes. */
export function Scorecard(props: {
  card: Card;
  title: string;
  avatar: string;
  seat: number;
  current: boolean;
  compact?: boolean;
}) {
  const { card } = props;
  const upper = upperTotal(card);
  const bonus = upperBonus(card);
  return (
    <div
      className={[
        'yz-card',
        props.compact && 'compact',
        props.current && 'current',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--seat': colorFor(props.seat) } as CSSProperties}
    >
      <div className="yz-card-head">
        <span>{props.avatar}</span>
        <span className="yz-card-name">{props.title}</span>
        <strong>{grandTotal(card)}</strong>
      </div>
      <div className="yz-rows">
        {CATEGORIES.map((c) => (
          <div key={c.id} className={card[c.id] === null ? 'yz-row open' : 'yz-row'}>
            <span className="yz-row-name">{c.name}</span>
            <span className="yz-row-pts">{card[c.id] ?? '–'}</span>
          </div>
        ))}
      </div>
      <div className="yz-upper">
        upper: {upper}/{UPPER_TARGET}
        {bonus > 0 && <span className="yz-bonus"> +{bonus} ✓</span>}
      </div>
    </div>
  );
}
