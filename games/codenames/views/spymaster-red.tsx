import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CodenamesView } from '../game.js';
import { Spymaster } from './Spymaster.js';

export default function SpymasterRed(props: GameViewProps<CodenamesView>) {
  return <Spymaster team="red" props={props} />;
}
