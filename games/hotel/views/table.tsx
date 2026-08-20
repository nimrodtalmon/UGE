import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { HotelView } from '../game.js';
import { money } from '../sim.js';
import { Ledger, ReportCard, Stats, Tower } from './parts.js';

// display-only: the builder plays on the phone, this screen just narrates
export default function TableView({ view, over }: GameViewProps<HotelView>) {
  return (
    <div className="ho-screen ho-table">
      <p className={over ? 'ho-over' : 'ho-over quiet'}>
        {over
          ? over.text
          : view.relaxed
            ? `🏨 Hotel Empire — relaxed run, week ${view.week}`
            : `🏨 ${money(view.cash)} of ${money(view.goal)} · ${view.weeksLeft} weeks left`}
      </p>

      <Stats view={view} big />

      <div className="ho-columns">
        <Tower view={view} />
        <div className="ho-side">
          <ReportCard view={view} />
          <p className="ho-panel-title">last weeks</p>
          <Ledger view={view} />
        </div>
      </div>
    </div>
  );
}
