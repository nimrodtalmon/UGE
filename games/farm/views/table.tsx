import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { FarmView } from '../game.js';
import { Barn, DayLog, Field, Market, Stats } from './parts.js';

/** Display only: the same farm, big, with no handlers anywhere. */
export default function TableView({ view, me, players, over }: GameViewProps<FarmView>) {
  const farmer = me ?? players[0] ?? null;
  const who = farmer ? `${farmer.avatar} ${farmer.name}` : 'the farmer';
  const goal =
    view.goal === null
      ? 'farming forever'
      : `$${view.money} of $${view.goal} · ${view.daysLeft ?? 0} days left`;

  return (
    <div className="fa-screen">
      <h1 className="fa-title">🚜 Little Farm</h1>
      <Stats view={view} />
      <Market view={view} big />
      <Field view={view} big />
      <Barn view={view} />
      <p className={over ? 'fa-note fa-over' : 'fa-note'}>
        {over ? over.text : `${who} — ${goal}`}
      </p>
      <DayLog log={view.log} lines={6} />
    </div>
  );
}
