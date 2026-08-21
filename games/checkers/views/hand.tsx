import './style.css';
import { useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { CkView } from '../game.js';
import { legalSteps } from '../rules.js';
import { Board } from './Board.js';

export default function HandView({ view, over, move }: GameViewProps<CkView>) {
  const [picked, setPicked] = useState<number | null>(null);
  const mySeat = view.myIndex === 1 ? 1 : 0;
  const myTurn = !over && view.myIndex >= 0 && view.myIndex === view.turn;
  useTurnBuzz(myTurn);

  const steps = myTurn
    ? legalSteps({ board: view.board, turn: view.turn, chain: view.chain })
    : [];
  const sources = [...new Set(steps.map((s) => s.from))];
  // Mid-chain the piece is not a choice; with a single option, save a tap.
  const sel =
    view.chain !== null && myTurn
      ? view.chain
      : picked !== null && sources.includes(picked)
        ? picked
        : sources.length === 1
          ? (sources[0] ?? null)
          : null;
  const targets = steps.filter((s) => s.from === sel).map((s) => s.to);

  const tap = (sq: number) => {
    if (!myTurn) return;
    if (sel !== null && targets.includes(sq)) {
      move('step', sel, sq);
      setPicked(null);
      return;
    }
    setPicked(sources.includes(sq) && sq !== sel ? sq : null);
  };

  const status = over
    ? over.text
    : myTurn
      ? 'your move'
      : `${view.names[view.turn]} is thinking…`;
  const note = over
    ? ''
    : myTurn && view.chain !== null
      ? 'keep jumping — that piece takes again'
      : myTurn && view.mustCapture
        ? 'a jump is on offer — you must take it'
        : view.lastMove?.crowned
          ? 'crowned 👑'
          : myTurn
            ? 'tap one of your pieces to see where it can go'
            : '';

  return (
    <div className="ck-screen ck-phone">
      <p className="ck-status">{status}</p>
      {/* always rendered: a hint appearing above the board would shove every
          square down a line, right under the finger about to tap one */}
      <p className="ck-note">{note || ' '}</p>
      <Board
        view={view}
        flipped={mySeat === 1}
        selected={sel}
        targets={targets}
        onTap={myTurn ? tap : undefined}
      />
      <p className="ck-tally">
        🔴 {view.names[0]} · {view.left[0]}&ensp;vs&ensp;⚫ {view.names[1]} · {view.left[1]}
      </p>
      {/* reserved: the button vanishing at game over would re-centre the board */}
      <div className="ck-resign-slot">
        {!over && (
          <button className="ck-resign" onClick={() => move('resign')}>
            Resign 🏳️
          </button>
        )}
      </div>
    </div>
  );
}
