import './style.css';
import { useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { BOOTS_COST, BOOTS_ENERGY, isRipe } from '../lib.js';
import type { FarmView } from '../game.js';
import { Barn, DayLog, Field, Market, Stats, TOOLS, canAfford, canApply } from './parts.js';
import type { Tool } from './parts.js';

const FIRST_TOOL: Tool = TOOLS[0] ?? {
  key: 'till',
  icon: '🪓',
  label: 'till',
  cost: 0,
  energy: 1,
  crop: null,
  animal: null,
};

/** One line of guidance, chosen from what the farm most needs right now. */
function hintFor(view: FarmView, tool: Tool): string {
  if (view.energy < 1) return 'out of energy — end the day 🌙';
  if (view.ripe > 0) return `${view.ripe} ripe — gather with ✋`;
  if (view.readyPens > 0) return `${view.readyPens} pen${view.readyPens > 1 ? 's' : ''} ready — ✋`;
  if (view.thirsty > 0) return `${view.thirsty} crop${view.thirsty > 1 ? 's' : ''} still dry 💧`;
  if (tool.crop !== null) return 'tap a tilled bed to sow';
  if (tool.animal !== null) return 'tap bare dirt to build the pen';
  return 'pick a tool, then tap a plot';
}

export default function HandView({ view, over, move }: GameViewProps<FarmView>) {
  const [tool, setTool] = useState<Tool>(FIRST_TOOL);
  const [confirming, setConfirming] = useState(false);
  const playing = !over;

  const apply = (i: number): void => {
    setConfirming(false);
    const plot = view.plots[i];
    if (!plot || !playing) return;
    if (!canApply(tool, plot) || !canAfford(tool, view)) return;
    if (tool.animal !== null) move('buyPen', i, tool.animal);
    else if (tool.crop !== null) move('plant', i, tool.crop);
    else if (tool.key === 'till') move('till', i);
    else if (tool.key === 'water') move('water', i);
    else if (tool.key === 'gather') move(isRipe(plot) ? 'harvest' : 'collect', i);
  };

  const restart = (): void => {
    if (confirming) {
      move('restart');
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  const act = (name: string, ...args: unknown[]): void => {
    setConfirming(false);
    move(name, ...args);
  };

  // one reserved line doing three jobs: result, restart confirm, live hint
  const note = over
    ? over.text
    : confirming
      ? 'tap ↺ again to start a new farm'
      : hintFor(view, tool);

  return (
    <div className="fa-screen fa-phone">
      <Stats view={view}>
        <button className="fa-mini" disabled={!playing} onClick={restart} aria-label="new farm">
          ↺
        </button>
      </Stats>

      <Market view={view} />

      <p className={over ? 'fa-note fa-over' : confirming ? 'fa-note fa-warn' : 'fa-note'}>{note}</p>

      <Field view={view} tool={tool} onTap={apply} />

      <div className="fa-palette" role="group" aria-label="tools">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            className={t.key === tool.key ? 'fa-chip fa-on' : 'fa-chip'}
            disabled={!playing || !canAfford(t, view)}
            onClick={() => {
              setConfirming(false);
              setTool(t);
            }}
          >
            <span className="fa-chip-icon">{t.icon}</span>
            <span className="fa-chip-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="fa-shelf">
        <Barn view={view} />
        {view.boots ? (
          <span className="fa-boots fa-owned">🥾 {BOOTS_ENERGY}</span>
        ) : (
          <button
            className="fa-boots"
            disabled={!playing || view.money < BOOTS_COST}
            onClick={() => act('buyUpgrade', 'boots')}
          >
            🥾 ${BOOTS_COST}
          </button>
        )}
      </div>

      <div className="fa-actions">
        <button
          className="fa-action fa-sell"
          disabled={!playing || view.barnValue < 1}
          onClick={() => act('sellAll')}
        >
          💰 Sell barn <b>${view.barnValue}</b>
        </button>
        <button className="fa-action fa-end" disabled={!playing} onClick={() => act('endDay')}>
          🌙 End day
        </button>
      </div>

      <DayLog log={view.log} lines={2} />
    </div>
  );
}
