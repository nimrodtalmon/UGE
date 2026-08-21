import './style.css';
import { useEffect, useState } from 'react';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { DomView } from '../game.js';
import type { End } from '../tiles.js';
import { Chain, Half, nameOf, OpenEnds, Seats, TileById } from './parts.js';

export default function HandView({ view, players, over, move }: GameViewProps<DomView>) {
  // a tile that fits both ends waits here until the player says which end
  const [pick, setPick] = useState<string | null>(null);
  const myTurn = !over && view.myIndex >= 0 && view.myIndex === view.turn;

  useTurnBuzz(myTurn);
  useEffect(() => setPick(null), [view.turn, view.chain.length]);

  if (view.hand === null || view.myIndex < 0) {
    return (
      <div className="dom-screen">
        <p className="dom-status">Dominoes in progress — you're watching.</p>
        <Seats view={view} players={players} />
      </div>
    );
  }

  if (over) {
    return (
      <div className="dom-screen">
        <p className="dom-over">{over.text}</p>
        <Seats view={view} players={players} />
      </div>
    );
  }

  const endsOf = (id: string): End[] => view.legal.find((l) => l.id === id)?.ends ?? [];
  const stuck = view.legal.length === 0;
  const canDraw = myTurn && stuck && view.boneyard > 0;
  const canPass = myTurn && stuck && view.boneyard === 0;

  const tap = (id: string) => {
    if (!myTurn) return;
    const ends = endsOf(id);
    if (ends.length === 0) return;
    if (ends.length === 1) move('play', id, ends[0]);
    else setPick(id);
  };

  const status = myTurn
    ? stuck
      ? view.boneyard > 0
        ? `nothing fits — draw a tile${view.drawnThisTurn > 0 ? ` (drew ${view.drawnThisTurn})` : ''}`
        : 'nothing fits and the boneyard is empty'
      : 'your turn — tap a tile that matches an end'
    : `${nameOf(view, players, view.turn)}'s turn…`;

  return (
    <div className="dom-screen dom-phone">
      <Seats view={view} players={players} />
      <OpenEnds view={view} />
      <Chain view={view} />

      {/* both lines are always held: the status swaps length every turn and
          the button below it must never move under a reaching thumb */}
      <p className={myTurn ? 'dom-status mine' : 'dom-status'}>{status}</p>

      <div className="dom-hand">
        {view.hand.map((id) => {
          const playable = myTurn && endsOf(id).length > 0;
          return (
            <button
              key={id}
              className={playable ? 'dom-slot playable' : 'dom-slot'}
              disabled={!playable}
              onClick={() => tap(id)}
            >
              <TileById id={id} vertical size="big" />
            </button>
          );
        })}
      </div>

      <div className="dom-actions">
        {canPass ? (
          <button className="dom-act" onClick={() => move('pass')}>
            Pass
          </button>
        ) : (
          <button className="dom-act primary" disabled={!canDraw} onClick={() => move('draw')}>
            {canDraw ? `Draw a tile (${view.boneyard} left)` : `boneyard: ${view.boneyard}`}
          </button>
        )}
      </div>

      {pick !== null && (
        <div className="dom-picker" onClick={() => setPick(null)}>
          <div className="dom-picker-box" onClick={(e) => e.stopPropagation()}>
            <p>it fits both ends</p>
            <TileById id={pick} vertical size="big" />
            <div className="dom-picker-row">
              <button
                className="dom-pick"
                onClick={() => {
                  move('play', pick, 'left');
                  setPick(null);
                }}
              >
                ◀ left
                {view.left === 0 ? <span className="dom-blank">blank</span> : <Half n={view.left} />}
              </button>
              <button
                className="dom-pick"
                onClick={() => {
                  move('play', pick, 'right');
                  setPick(null);
                }}
              >
                right ▶
                {view.right === 0 ? <span className="dom-blank">blank</span> : <Half n={view.right} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
