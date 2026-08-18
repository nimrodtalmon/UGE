import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CodenamesView } from '../game.js';
import { Spymaster } from './Spymaster.js';

export default function SpymasterBlue(props: GameViewProps<CodenamesView>) {
  return <Spymaster team="blue" props={props} />;
}
