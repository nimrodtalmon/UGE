import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { avatarFor } from '../../../src/shared/avatar.js';
import type { RkView } from '../game.js';
import { Melds } from './parts.js';

export default function TableView({ view, players, over }: GameViewProps<RkView>) {
  return (
    <div className="rk-screen">
      <div className="rk-players">
        {view.names.map((name, i) => (
          <div key={i} className={view.winner === null && i === view.turn ? 'rk-player current' : 'rk-player'}>
            <span>{players[i]?.avatar ?? avatarFor(name)}</span>
            <span className="rk-name">{players[i]?.name ?? name}</span>
            <span className="rk-count">{view.counts[i]} 🁢</span>
            {!view.melded[i] && <span className="rk-tag">not open</span>}
          </div>
        ))}
        <span className="rk-pool">pool {view.poolCount}</span>
      </div>
      {over ? (
        <p className="rk-over">{over.text}</p>
      ) : (
        <p className="rk-turn">{players[view.turn]?.name ?? view.names[view.turn]}'s turn</p>
      )}
      <Melds view={view} big />
    </div>
  );
}
