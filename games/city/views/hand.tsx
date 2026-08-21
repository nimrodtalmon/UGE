import './style.css';
import { useEffect, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { BULLDOZE_COST, COST, ICON, LABEL } from '../lib.js';
import type { BuildKind, CityView } from '../lib.js';
import { adviceFor, Grid, Log, Meters, Stats } from './parts.js';

type Tool = BuildKind | 'bulldoze';

/** Order the palette by what a new mayor reaches for, cheapest first. */
const PALETTE: BuildKind[] = ['road', 'house', 'park', 'shop', 'factory', 'plant'];

export default function HandView({ view, over, move }: GameViewProps<CityView>) {
  const [tool, setTool] = useState<Tool>('house');
  const [confirming, setConfirming] = useState(false);
  const playing = view.status === 'playing';

  // the reset guard disarms itself, so a forgotten tap can't bulldoze a whole
  // city ten minutes later
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  const costOf = (t: Tool): number => (t === 'bulldoze' ? BULLDOZE_COST : COST[t]);
  const affordable = (t: Tool): boolean => view.money >= costOf(t);

  const tap = (x: number, y: number): void => {
    setConfirming(false);
    if (tool === 'bulldoze') move('bulldoze', x, y);
    else move('build', x, y, tool);
  };

  const restart = (): void => {
    if (confirming) {
      move('restart');
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  // one line, three jobs: the reset guard, the result, the standing advice
  const hint = confirming
    ? 'tap ↻ again to level the city and start over'
    : over
      ? over.text
      : !affordable(tool)
        ? `not enough money for ${tool === 'bulldoze' ? 'the bulldozer' : LABEL[tool]}`
        : adviceFor(view);

  return (
    <div className="ct-screen ct-phone">
      <Stats view={view} />
      <Meters view={view} />

      <div className="ct-palette" role="group" aria-label="build tool">
        {PALETTE.map((kind) => (
          <button
            key={kind}
            className={[
              'ct-chip',
              tool === kind ? 'ct-on' : '',
              affordable(kind) ? '' : 'ct-poor',
            ].join(' ')}
            disabled={!playing}
            onClick={() => setTool(kind)}
          >
            <span className="ct-chip-icon">{ICON[kind]}</span>
            <span className="ct-chip-name">{LABEL[kind]}</span>
            <span className="ct-chip-cost">${COST[kind]}</span>
          </button>
        ))}
        <button
          className={['ct-chip', 'ct-raze', tool === 'bulldoze' ? 'ct-on' : ''].join(' ')}
          disabled={!playing}
          onClick={() => setTool('bulldoze')}
        >
          <span className="ct-chip-icon">🚜</span>
          <span className="ct-chip-name">bulldoze</span>
          <span className="ct-chip-cost">${BULLDOZE_COST}</span>
        </button>
      </div>

      <Grid view={view} onTap={tap} />

      {/* always rendered: a line appearing on tap would shove the map under
          the finger about to tap it again */}
      <p className={over ? 'ct-hint ct-over' : confirming ? 'ct-hint ct-warned' : 'ct-hint'}>
        {hint}
      </p>

      <div className="ct-actions">
        <button className="ct-next" disabled={!playing} onClick={() => move('nextYear')}>
          ▶ Next year
        </button>
        <button
          className={confirming ? 'ct-reset ct-armed' : 'ct-reset'}
          aria-label="new city"
          onClick={restart}
        >
          ↻
        </button>
      </div>

      <Log view={view} />
    </div>
  );
}
