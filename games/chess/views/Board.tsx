import { Chess } from 'chess.js';
import type { ChessView } from '../game.js';

const GLYPH: Record<string, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

export function Board(props: {
  view: ChessView;
  flipped: boolean;
  selected?: string | null;
  targets?: string[];
  onTap?: (square: string) => void;
  big?: boolean;
}) {
  const { view } = props;
  const chess = new Chess(view.fen);
  const grid = chess.board(); // rank 8 first
  const ranks = props.flipped ? [...grid].reverse().map((row) => [...row].reverse()) : grid;
  return (
    <div className={props.big ? 'ch-board big' : 'ch-board'}>
      {ranks.flatMap((row, r) =>
        row.map((cell, f) => {
          const rank = props.flipped ? r + 1 : 8 - r;
          const file = props.flipped ? 7 - f : f;
          const sq = `${'abcdefgh'[file]}${rank}`;
          const classes = ['ch-sq', (file + rank) % 2 === 0 ? 'dark' : 'light'];
          if (view.lastMove && (view.lastMove.from === sq || view.lastMove.to === sq)) {
            classes.push('last');
          }
          if (props.selected === sq) classes.push('sel');
          if (props.targets?.includes(sq)) classes.push('target');
          return (
            <button
              key={sq}
              data-sq={sq}
              className={classes.join(' ')}
              disabled={!props.onTap}
              onClick={() => props.onTap?.(sq)}
            >
              {cell && (
                <span className={cell.color === 'w' ? 'ch-piece w' : 'ch-piece b'}>
                  {GLYPH[cell.type]}
                </span>
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}
