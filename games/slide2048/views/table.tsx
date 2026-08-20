import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { Slide2048View } from '../game.js';
import { Banner, Board, Stats } from './parts.js';

export default function TableView({ view, over }: GameViewProps<Slide2048View>) {
  return (
    <div className="sl-screen">
      <h1 className="sl-title">2048</h1>
      <Stats view={view} />
      <Banner view={view} over={over} />
      <Board view={view} big />
      <p className="sl-hint">swipe on your phone — equal tiles merge</p>
    </div>
  );
}
