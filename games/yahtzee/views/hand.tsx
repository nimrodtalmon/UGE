import './style.css';
import { useEffect, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { YahtzeeView } from '../game.js';
import { CATEGORIES, scoreFor } from '../scoring.js';
import type { CategoryId } from '../scoring.js';
import { Dice, Scorecard, seatAvatar, seatName } from './parts.js';

export default function HandView({ view, players, over, move }: GameViewProps<YahtzeeView>) {
  const myTurn = !over && (view.pass || view.myIndex === view.current);
  useTurnBuzz(myTurn && !view.pass);

  // fat-finger guard: first tap arms a category, second tap scores it
  const [pending, setPending] = useState<CategoryId | null>(null);
  const diceKey = view.dice.join(',');
  useEffect(() => {
    setPending(null);
  }, [diceKey, view.rollsLeft, view.current]);

  if (over) {
    return (
      <div className="yz-screen yz-phone">
        <p className="yz-over">{over.text}</p>
        {view.myIndex >= 0 && view.cards[view.myIndex] && (
          <Scorecard
            card={view.cards[view.myIndex]!}
            title={seatName(view, players, view.myIndex)}
            avatar={seatAvatar(view, players, view.myIndex)}
            seat={view.myIndex}
            current={false}
          />
        )}
      </div>
    );
  }

  if (!myTurn) {
    return (
      <div className="yz-screen yz-phone">
        <p className="yz-turn">{seatName(view, players, view.current)} is rolling…</p>
        {view.myIndex >= 0 && view.cards[view.myIndex] ? (
          <Scorecard
            card={view.cards[view.myIndex]!}
            title={seatName(view, players, view.myIndex)}
            avatar={seatAvatar(view, players, view.myIndex)}
            seat={view.myIndex}
            current={false}
          />
        ) : (
          <p className="yz-hint">Dice Poker in progress — you're watching.</p>
        )}
      </div>
    );
  }

  const rolled = view.rollsLeft < 3;
  const card = view.cards[view.current]!;
  const pendingCat = pending ? CATEGORIES.find((c) => c.id === pending) : undefined;

  return (
    <div className="yz-screen yz-phone">
      {view.pass ? (
        <p className="yz-banner">📲 pass the phone to {view.playerNames[view.current]}</p>
      ) : (
        <p className="yz-turn mine">Your turn!</p>
      )}

      <Dice dice={view.dice} held={view.held} onToggle={(i) => move('hold', i)} disabled={!rolled} />
      <p className="yz-hint small">
        {rolled ? 'tap dice to hold them' : 'roll to start your turn'}
      </p>

      <button className="yz-roll" disabled={view.rollsLeft === 0} onClick={() => move('roll')}>
        {view.rollsLeft === 0 ? 'No rolls left — pick a box' : `Roll (${view.rollsLeft} left)`}
      </button>

      {pendingCat && (
        <p className="yz-confirm">
          tap again to score {scoreFor(pendingCat.id, view.dice)} in {pendingCat.name}
        </p>
      )}

      <div className="yz-picker">
        {CATEGORIES.map((c) => {
          const used = card[c.id] !== null;
          const pts = used ? card[c.id]! : rolled ? scoreFor(c.id, view.dice) : null;
          if (used) {
            return (
              <div key={c.id} className="yz-cat used">
                <span>{c.name}</span>
                <strong>{pts}</strong>
              </div>
            );
          }
          const classes = ['yz-cat'];
          if (pending === c.id) classes.push('pending');
          else if (pts === 0) classes.push('zero');
          return (
            <button
              key={c.id}
              className={classes.join(' ')}
              disabled={!rolled}
              onClick={() => {
                if (pending === c.id) {
                  move('score', c.id);
                  setPending(null);
                } else {
                  setPending(c.id);
                }
              }}
            >
              <span>{c.name}</span>
              <strong>{pts ?? '–'}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}
