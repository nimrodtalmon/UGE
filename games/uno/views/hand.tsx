import './style.css';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { isLegal } from '../game.js';
import type { Color, WcView } from '../game.js';
import { CardFace, PlayerRing, colorStyle } from './parts.js';

/** A hand card you can tap — or drag toward the pile to play. */
function DragSlot(props: {
  className: string;
  disabled: boolean;
  onPlay: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const snapBack = () => {
    if (ref.current) {
      ref.current.style.transition = 'transform 0.15s';
      ref.current.style.transform = '';
    }
  };
  return (
    <button
      ref={ref}
      className={props.className}
      disabled={props.disabled}
      onClick={() => {
        if (!dragged.current) props.onPlay();
      }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        dragged.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (ref.current) ref.current.style.transition = 'none';
      }}
      onPointerMove={(e) => {
        if (!start.current || !ref.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) dragged.current = true;
        if (dragged.current) {
          ref.current.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 20}deg)`;
        }
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (s && dragged.current) {
          snapBack();
          if (e.clientY - s.y < -70) props.onPlay(); // flicked toward the pile
        }
      }}
      onPointerCancel={() => {
        start.current = null;
        snapBack();
      }}
    >
      {props.children}
    </button>
  );
}

const PICK: { c: Color; label: string }[] = [
  { c: 'r', label: '🔴' },
  { c: 'g', label: '🟢' },
  { c: 'b', label: '🔵' },
  { c: 'y', label: '🟡' },
];

export default function HandView({ view, players, over, move }: GameViewProps<WcView>) {
  const [wildIdx, setWildIdx] = useState<number | null>(null);
  const myTurn =
    view.winner === null && (view.hotseat ? view.unlocked : view.myIndex === view.turn);

  useEffect(() => {
    if (myTurn && !view.hotseat) navigator.vibrate?.(80);
  }, [myTurn, view.hotseat]);
  useEffect(() => setWildIdx(null), [view.turn, view.top.s, view.top.c]);

  // hotseat: the phone is "locked" between turns so nobody peeks
  if (view.hotseat && !over && !view.unlocked) {
    return (
      <div className="wc-screen wc-phone">
        <PlayerRing view={view} players={players} />
        <p className="wc-pass-title">📲 Pass the phone to</p>
        <p className="wc-pass-name">{view.playerNames[view.turn]}</p>
        <button className="primary wc-take" onClick={() => move('takePhone')}>
          I'm {view.playerNames[view.turn]} — show my cards
        </button>
      </div>
    );
  }

  if (view.hand === null) {
    return (
      <div className="wc-screen">
        <p className="wc-turn">UNO in progress — you're watching.</p>
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
          : `${(view.hotseat ? undefined : players[view.turn]?.name) ?? view.playerNames[view.turn]}'s turn…`}
      </p>

      <div className="wc-hand">
        {view.hand.map((card, i) => (
          <DragSlot
            key={i}
            className={[
              'wc-slot',
              canPlay(i) && 'playable',
              view.pendingCardIdx === i && 'drawn',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={!canPlay(i)}
            onPlay={() => tapCard(i)}
          >
            <CardFace card={card} />
          </DragSlot>
        ))}
      </div>
      {/* always rendered: a hint popping in here would shove the Draw button
          down under the finger that is already reaching for it */}
      <p className="wc-drag-hint">{myTurn ? 'tap a card — or flick it at the pile' : ' '}</p>

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
