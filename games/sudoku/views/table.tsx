import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { SdView } from '../game.js';
import { Grid, Hud, useElapsed } from './parts.js';

/** Display only — the grid is filled in on the phone. */
export default function TableView({ view, me, players, over, serverNow }: GameViewProps<SdView>) {
  const elapsed = useElapsed(view, serverNow);
  const solver = me ?? players[0] ?? null;
  const left = view.digits.filter((d) => d === 0).length;

  return (
    <div className="sd-screen">
      <h1 className="sd-title">Sudoku</h1>
      <Hud view={view} elapsed={elapsed} />
      <Grid view={view} big />
      <p className={over ? 'sd-note sd-over' : 'sd-note'}>
        {over
          ? over.text
          : `${solver ? `${solver.avatar} ${solver.name}` : 'the solver'} — ${left} squares left, fill them in on your phone`}
      </p>
    </div>
  );
}
