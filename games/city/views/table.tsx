import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { CityView } from '../lib.js';
import { adviceFor, Grid, Log, Meters, Stats } from './parts.js';

/** Display-only: the same city, larger, with no gameplay handlers. */
export default function TableView({ view, me, players, over }: GameViewProps<CityView>) {
  const mayor = me ?? players[0] ?? null;
  const who = mayor ? `${mayor.avatar} ${mayor.name}` : 'the mayor';
  return (
    <div className="ct-screen">
      <h1 className="ct-title">Tiny City</h1>
      <p className={over ? 'ct-hint ct-over' : 'ct-hint'}>
        {over ? over.text : `${who} is building — the map is on the phone`}
      </p>
      <Stats view={view} big />
      <Meters view={view} />
      <Grid view={view} big />
      <p className="ct-hint">{over ? '' : adviceFor(view)}</p>
      <Log view={view} big />
    </div>
  );
}
