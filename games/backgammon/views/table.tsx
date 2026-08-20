import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { BgView } from '../game.js';
import { Board, Dice } from './parts.js';

export default function TableView({ view, over }: GameViewProps<BgView>) {
  const status = over
    ? over.text
    : `${view.turn === 0 ? '⚪' : '⚫'} ${view.names[view.turn]} ${
        view.phase === 'roll' ? 'to roll' : 'to move'
      }`;
  return (
    <div className="bg-screen">
      <p className="bg-status">{status}</p>
      {/* always rendered: the note comes and goes each turn and would jog the board */}
      <p className="bg-note">{view.note ?? ' '}</p>
      <Dice view={view} />
      <Board view={view} perspective={0} big />
      <p className="bg-names">
        ⚪ {view.names[0]} · {view.borneOff[0]} off&ensp;vs&ensp;⚫ {view.names[1]} ·{' '}
        {view.borneOff[1]} off
      </p>
    </div>
  );
}
