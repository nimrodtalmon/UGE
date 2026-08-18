import type { CSSProperties } from 'react';
import { avatarFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import type { Card, WcView } from '../game.js';

const SYM: Record<string, string> = { skip: '⊘', rev: '⇄', wild: '★', '+2': '+2', '+4': '+4' };

export function CardFace({ card, big }: { card: Card; big?: boolean }) {
  return (
    <span className={`wc-card ${card.c}${big ? ' big' : ''}`}>
      <span className="wc-sym">{SYM[card.s] ?? card.s}</span>
      {card.c === 'w' && <span className="wc-wilddots">🔴🟢🔵🟡</span>}
    </span>
  );
}

export function PlayerRing({ view, players }: { view: WcView; players: PlayerInfo[] }) {
  return (
    <div className="wc-players">
      {view.playerNames.map((name, i) => {
        // live identity for real seats; hotseat's virtual "Player N" seats stay as-is
        const live = view.hotseat ? undefined : players[i];
        return (
          <div
            key={i}
            className={view.winner === null && i === view.turn ? 'wc-player current' : 'wc-player'}
          >
            <span className="wc-avatar">{live?.avatar ?? avatarFor(name)}</span>
            <span className="wc-name">{live?.name ?? name}</span>
            <span className="wc-count">{view.counts[i]} 🂠</span>
          </div>
        );
      })}
      <span className="wc-dir">{view.dir === 1 ? '⟳' : '⟲'}</span>
    </div>
  );
}

export function colorStyle(view: WcView): CSSProperties {
  const map = { r: '#d64541', g: '#3dbf6e', b: '#3d8ae4', y: '#e4b83d' };
  return { '--wc-active': map[view.color] } as CSSProperties;
}
