import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { LightsOutState } from '../game.js';
import { Board, Status } from './Board.js';

export default function TableView(props: GameViewProps<LightsOutState>) {
  return (
    <div className="lo-screen">
      <h1 className="lo-title">Lights Out</h1>
      <p className="lo-hint">turn every light off — play on your phone</p>
      <Board view={props.view} over={props.over} />
      <Status view={props.view} over={props.over} />
    </div>
  );
}
