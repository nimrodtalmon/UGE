import './style.css';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import { colorFor } from '../../../src/shared/avatar.js';
import type { SetView } from '../game.js';
import { FLASH_MS } from '../game.js';
import { Board } from './board.js';
import { SetDefs } from './card.js';

export default function HandView({ view, players, me, over, move, serverNow }: GameViewProps<SetView>) {
  const [picked, setPicked] = useState<number[]>([]);

  // A fresh table (or a lockout) clears whatever was half-tapped, so a stale
  // selection can never be sent against cards that have already been replaced.
  useEffect(() => setPicked([]), [view.serial, view.myLockedUntil]);

  const locked = view.myLockedUntil > serverNow;
  const lockLeft = useDeadline({ active: locked && !over, endsAt: view.myLockedUntil, serverNow });

  const claim = view.lastClaim;
  const fresh = claim !== null && serverNow - claim.at < FLASH_MS + 1_200;
  const mine = claim !== null && claim.seat === view.myIndex;
  // only a bad call leaves its cards on the table to ring
  const wrong = fresh && claim !== null && !claim.ok && mine
    ? view.board.flatMap((c, i) => (c !== null && claim.cards.includes(c) ? [i] : []))
    : [];

  const tap = (slot: number) => {
    if (locked || over) return;
    if (picked.includes(slot)) {
      setPicked(picked.filter((p) => p !== slot));
      return;
    }
    const next = [...picked, slot];
    if (next.length < 3) {
      setPicked(next);
      return;
    }
    setPicked([]);
    move('claim', next);
  };

  const status = (): string => {
    if (over) return over.text;
    if (locked) return `✗ not a set — ${formatSeconds(lockLeft)}s`;
    if (fresh && claim !== null && claim.ok) {
      const who = claim.seat === view.myIndex ? 'You' : (view.names[claim.seat] ?? 'Someone');
      return `${who} took a set ✓`;
    }
    if (picked.length > 0) return `${picked.length} of 3 tapped`;
    return 'Tap three cards that make a set';
  };

  if (view.myIndex < 0) {
    return (
      <div className="st-screen st-phone">
        <SetDefs />
        <p className="st-status">Set in progress — you're watching.</p>
        <div className="st-boardwrap">
          <Board board={view.board} selected={[]} wrong={[]} locked shape="phone" />
        </div>
        <p className="st-foot">{view.deckLeft} cards left in the deck</p>
      </div>
    );
  }

  return (
    <div className="st-screen st-phone">
      <SetDefs />
      <div className="st-hud">
        {view.names.map((name, i) => (
          <div
            key={i}
            className={`st-seat${i === view.myIndex ? ' me' : ''}`}
            style={{ '--seat': colorFor(i) } as CSSProperties}
          >
            <span className="st-av">{players[i]?.avatar ?? '🙂'}</span>
            <span className="st-who">{i === view.myIndex ? (me?.name ?? name) : (players[i]?.name ?? name)}</span>
            <strong>{view.scores[i] ?? 0}</strong>
          </div>
        ))}
      </div>

      <p className={`st-status${locked ? ' bad' : ''}${over ? ' done' : ''}`}>{status()}</p>

      <div className="st-boardwrap">
        <Board
          board={view.board}
          selected={picked}
          wrong={wrong}
          locked={locked || !!over}
          onTap={tap}
          shape="phone"
        />
      </div>

      <p className="st-foot">
        {view.deckLeft} in the deck · {view.board.filter((c) => c !== null).length} on the table
        {(view.misses[view.myIndex] ?? 0) > 0 ? ` · ${view.misses[view.myIndex]} misses` : ''}
      </p>
    </div>
  );
}
