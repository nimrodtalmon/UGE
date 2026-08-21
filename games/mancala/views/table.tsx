import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { MnView } from '../game.js';
import { storeOf } from '../rules.js';
import { Board } from './parts.js';

/** Display only — the table never sows a pit. */
export default function TableView({ view, over }: GameViewProps<MnView>) {
  const last = view.last;
  const status = over ? over.text : `${view.names[view.turn]} to sow`;
  const note = over
    ? ''
    : view.again
      ? `${view.names[view.turn]} landed in their store — another turn`
      : last && last.captured > 0
        ? `${view.names[last.by]} captured ${last.captured} seeds!`
        : '';
  return (
    <div className="mn-screen">
      <p className={view.again && !over ? 'mn-status again' : 'mn-status'}>{status}</p>
      {/* always rendered: the note comes and goes each turn and would jog the board */}
      <p className="mn-note">{note || ' '}</p>
      <Board view={view} perspective={0} big />
      <p className="mn-scores">
        🫘 {view.names[0]} {view.pits[storeOf(0)] ?? 0}&ensp;·&ensp;{view.names[1]}{' '}
        {view.pits[storeOf(1)] ?? 0}
      </p>
    </div>
  );
}
