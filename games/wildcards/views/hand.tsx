import './style.css';
import { useEffect, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { isLegal } from '../game.js';
import type { Color, WcView } from '../game.js';
import { CardFace, PlayerRing, colorStyle } from './parts.js';

const PICK: { c: Color; label: string }[] = [
  { c: 'r', label: '🔴' },
  { c: 'g', label: '🟢' },
  { c: 'b', label: '🔵' },
  { c: 'y', label: '🟡' },
];

export default function HandView({ view, players, over, move }: GameViewProps<WcView>) {
  const [wildIdx, setWildIdx] = useState<number | null>(null);
  const myTurn = view.winner === null && view.myIndex === view.turn;

  useEffect(() => {
    if (myTurn) navigator.vibrate?.(80);
  }, [myTurn]);
  useEffect(() => setWildIdx(null), [view.turn, view.top.s, view.top.c]);

  if (view.hand === null) {
    return (
      <div className="wc-screen">
        <p className="wc-turn">Wildcards in progress — you're watching.</p>
      </div>
    );
  }

  if (over) {
    return (
      <div className="wc-screen">
        <p className="wc-over">{over.text}</p>
        <PlayerRing view={view} players={players} />
      </div>
    );
  }

  const canPlay = (i: number) => {
    if (!myTurn) return false;
    if (view.pendingCardIdx !== null) return i === view.pendingCardIdx;
    return isLegal(view.hand![i]!, view.top, view.color);
  };

  const tapCard = (i: number) => {
    if (!canPlay(i)) return;
    if (view.hand![i]!.c === 'w') setWildIdx(i);
    else move('play', i);
  };

  return (
    <div className="wc-screen wc-phone" style={colorStyle(view)}>
      <PlayerRing view={view} players={players} />
      <div className="wc-center small">
        <CardFace card={view.top} big />
      </div>
      <p className={myTurn ? 'wc-turn mine' : 'wc-turn'}>
        {myTurn
          ? view.pendingCardIdx !== null
            ? 'you drew a playable card!'
            : 'your turn!'
          : `${view.playerNames[view.turn]}'s turn…`}
      </p>

      <div className="wc-hand">
        {view.hand.map((card, i) => (
          <button
            key={i}
            className={[
              'wc-slot',
              canPlay(i) && 'playable',
              view.pendingCardIdx === i && 'drawn',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={!canPlay(i)}
            onClick={() => tapCard(i)}
          >
            <CardFace card={card} />
          </button>
        ))}
      </div>

      <div className="wc-actions">
        {view.pendingCardIdx !== null && myTurn ? (
          <button onClick={() => move('keep')}>Keep it — pass</button>
        ) : (
          <button
            className="primary"
            disabled={!myTurn}
            onClick={() => move('draw')}
          >
            Draw a card
          </button>
        )}
      </div>

      {wildIdx !== null && (
        <div className="wc-picker" onClick={() => setWildIdx(null)}>
          <div className="wc-picker-box">
            <p>pick a color</p>
            <div className="wc-picker-row">
              {PICK.map(({ c, label }) => (
                <button
                  key={c}
                  className={`wc-pick ${c}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    move('play', wildIdx, c);
                    setWildIdx(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
