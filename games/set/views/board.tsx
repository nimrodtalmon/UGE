/**
 * The shared table of cards. The phone keeps three columns and grows
 * downwards, the table screen keeps three rows and grows sideways — either
 * way the deal-three-more rule never reflows what is already there.
 */

import type { CSSProperties } from 'react';
import type { Card } from '../lib.js';
import { CardFace } from './card.js';

export interface BoardProps {
  board: (Card | null)[];
  /** Slots this device has tapped, in tap order. */
  selected: number[];
  /** Slots to ring red — the three cards of a call that was not a set. */
  wrong: number[];
  locked: boolean;
  /** Absent on the table screen, which is display-only. */
  onTap?: (slot: number) => void;
  /** 'phone' = 3 columns, 'table' = 3 rows. */
  shape: 'phone' | 'table';
}

export function Board({ board, selected, wrong, locked, onTap, shape }: BoardProps) {
  const lanes = Math.max(4, Math.ceil(board.length / 3));
  const style =
    shape === 'phone'
      ? ({ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: `repeat(${Math.ceil(board.length / 3)}, 1fr)` } as CSSProperties)
      : ({ gridTemplateColumns: `repeat(${lanes}, 1fr)`, gridTemplateRows: 'repeat(3, 1fr)', gridAutoFlow: 'column' } as CSSProperties);

  return (
    <div className={`st-grid ${shape}`} style={style}>
      {board.map((card, i) => {
        const classes = ['st-card'];
        if (card === null) classes.push('gone');
        if (selected.includes(i)) classes.push('picked');
        if (wrong.includes(i)) classes.push('bad');
        if (onTap) {
          // always a button, never a div: swapping the element type mid-game
          // would remount the card and lose the tap that is landing on it
          return (
            <button
              key={i}
              className={classes.join(' ')}
              disabled={card === null || locked}
              onClick={() => onTap(i)}
              aria-label={`card ${i + 1}`}
            >
              {card !== null && <CardFace card={card} />}
            </button>
          );
        }
        return (
          <div key={i} className={classes.join(' ')}>
            {card !== null && <CardFace card={card} />}
          </div>
        );
      })}
    </div>
  );
}
