import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { WcView } from '../game.js';
import { CardFace, PlayerRing, colorStyle } from './parts.js';

export default function TableView({ view, players, over }: GameViewProps<WcView>) {
  return (
    <div className="wc-screen" style={colorStyle(view)}>
      <PlayerRing view={view} players={players} />
      {over ? (
        <p className="wc-over">{over.text}</p>
      ) : (
        <p className="wc-turn">{view.playerNames[view.turn]}'s turn</p>
      )}
      <div className="wc-center">
        <div className="wc-pile">
          <span className="wc-card back big">{view.drawCount}</span>
          <span className="wc-pile-label">draw</span>
        </div>
        <div className="wc-pile">
          <CardFace card={view.top} big />
          <span className="wc-pile-label">discard</span>
        </div>
      </div>
      <p className="wc-active-color">active color</p>
    </div>
  );
}
