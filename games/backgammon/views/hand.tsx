import './style.css';
import { useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import { legalSingleSteps } from '../game.js';
import type { BgView, Seat } from '../game.js';
import { Board, Dice } from './parts.js';

export default function HandView({ view, over, move }: GameViewProps<BgView>) {
  const [selected, setSelected] = useState<number | null>(null);
  const mySeat: Seat = view.shared ? view.turn : view.myIndex === 1 ? 1 : 0;
  const myTurn = !over && (view.shared || view.myIndex === view.turn);
  useTurnBuzz(myTurn && !view.shared);

  const steps = myTurn && view.phase === 'move' ? legalSingleSteps(view, view.turn, view.dice) : [];
  const sources = [...new Set(steps.map((s) => s.from))];
  // Keep the selection only while it stays legal; auto-select a lone source.
  const sel =
    selected !== null && sources.includes(selected)
      ? selected
      : sources.length === 1
        ? (sources[0] ?? null)
        : null;
  const usable = steps.filter((s) => s.from === sel);
  const targets = new Map<number, number>();
  for (const s of usable) if (s.to !== 'off') targets.set(s.to, s.die);
  const offDice = usable
    .filter((s) => s.to === 'off')
    .map((s) => s.die)
    .sort((a, b) => a - b);

  const play = (from: number, die: number) => {
    move('step', from, die);
    setSelected(null);
  };

  const tap = (p: number) => {
    if (sel !== null && p !== sel) {
      const die = targets.get(p);
      if (die !== undefined) {
        play(sel, die);
        return;
      }
    }
    setSelected(sources.includes(p) && p !== sel ? p : null);
  };

  const status = over
    ? over.text
    : view.shared
      ? `${view.turn === 0 ? '⚪ White' : '⚫ Black'} — ${
          view.phase === 'roll' ? 'roll!' : 'your move'
        } (pass the phone)`
      : myTurn
        ? view.phase === 'roll'
          ? 'your turn — roll!'
          : 'your move'
        : `${view.names[view.turn]} is ${view.phase === 'roll' ? 'rolling' : 'moving'}…`;

  return (
    <div className="bg-screen bg-phone">
      <p className="bg-status">{status}</p>
      {view.note && <p className="bg-note">{view.note}</p>}
      <Dice view={view} />
      <Board
        view={view}
        perspective={mySeat}
        selected={sel}
        sources={sources}
        targets={targets}
        canOff={offDice.length > 0}
        onTap={myTurn && view.phase === 'move' ? tap : undefined}
        onOff={() => {
          if (sel !== null && offDice[0] !== undefined) play(sel, offDice[0]);
        }}
      />
      {myTurn && view.phase === 'roll' && (
        <button className="bg-roll" onClick={() => move('roll')}>
          🎲 Roll
        </button>
      )}
      {sel !== null && usable.length > 0 && (
        <div className="bg-die-buttons">
          {usable.map((s) => (
            <button key={s.die} className="bg-die-btn" onClick={() => play(sel, s.die)}>
              {s.to === 'off' ? `bear off · ${s.die}` : `play ${s.die}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
