import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { LightsOutState } from '../game.js';
import { Board, Status } from './Board.js';

export default function HandView(props: GameViewProps<LightsOutState>) {
  return (
    <div className="lo-screen">
      <p className="lo-hint">{props.me ? `${props.me.name} — ` : ''}turn every light off</p>
      <Board view={props.view} over={props.over} onPress={(i) => props.move('press', i)} />
      <Status view={props.view} over={props.over} />
    </div>
  );
}
