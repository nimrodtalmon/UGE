import type { CkView } from '../game.js';
import { colOf, isDark, isKing, rowOf, sideOf } from '../rules.js';

/**
 * The 8x8 board. `flipped` turns it round so a seat always looks at the game
 * from its own side. Light squares are inert; only dark squares are buttons.
 */
export function Board(props: {
  view: CkView;
  flipped: boolean;
  selected?: number | null;
  targets?: number[];
  onTap?: (square: number) => void;
  big?: boolean;
}) {
  const { view } = props;
  const order = Array.from({ length: 64 }, (_, n) => (props.flipped ? 63 - n : n));
  return (
    <div className={props.big ? 'ck-board big' : 'ck-board'}>
      {order.map((i) => {
        const cell = view.board[i] ?? '';
        const side = sideOf(cell);
        const dark = isDark(i);
        const classes = ['ck-sq', dark ? 'dark' : 'light'];
        const last = view.lastMove;
        if (last && (last.from === i || last.to === i || last.cap === i)) classes.push('last');
        if (props.selected === i) classes.push('sel');
        if (props.targets?.includes(i)) classes.push('tgt');
        return (
          <button
            key={i}
            data-sq={i}
            className={classes.join(' ')}
            disabled={!props.onTap || !dark}
            onClick={() => props.onTap?.(i)}
            aria-label={`row ${rowOf(i) + 1} column ${colOf(i) + 1}`}
          >
            {side !== null && (
              <span className={`ck-pc ${side === 0 ? 'r' : 'b'}${isKing(cell) ? ' king' : ''}`}>
                {isKing(cell) ? '👑' : ''}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
