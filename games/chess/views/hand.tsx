import './style.css';
import { useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { ChessView } from '../game.js';
import { Board } from './Board.js';

export default function HandView({ view, over, move }: GameViewProps<ChessView>) {
  const [selected, setSelected] = useState<string | null>(null);
  const chess = new Chess(view.fen);
  const mySeat = view.shared ? (view.turn === 'w' ? 0 : 1) : view.myIndex;
  const myColor = mySeat === 0 ? 'w' : 'b';
  const myTurn = !over && view.turn === myColor && (view.shared || view.myIndex >= 0);
  const targets =
    selected !== null
      ? chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string)
      : [];

  const tap = (sq: string) => {
    if (!myTurn) return;
    if (selected && targets.includes(sq)) {
      move('move', selected, sq);
      setSelected(null);
      return;
    }
    const piece = chess.get(sq as Square);
    setSelected(piece && piece.color === view.turn ? sq : null);
  };

  return (
    <div className="ch-screen ch-phone">
      <p className="ch-status">
        {over
          ? over.text
          : view.shared
            ? `${view.turn === 'w' ? '⚪ White' : '⚫ Black'} to move — pass the phone${view.check ? ' · check!' : ''}`
            : myTurn
              ? `your move${view.check ? ' — you are in check!' : ''}`
              : `${view.names[view.turn === 'w' ? 0 : 1]} is thinking…${view.check ? ' check!' : ''}`}
      </p>
      <Board
        view={view}
        flipped={view.shared ? view.turn === 'b' : mySeat === 1}
        selected={selected}
        targets={targets}
        onTap={!over ? tap : undefined}
      />
      {!over && (
        <button className="ch-resign" onClick={() => move('resign')}>
          Resign 🏳️
        </button>
      )}
    </div>
  );
}
