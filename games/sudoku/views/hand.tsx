import './style.css';
import { useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { SdView } from '../game.js';
import { Grid, Hud, Pad, digitCounts, useElapsed } from './parts.js';

export default function HandView({ view, over, move, serverNow }: GameViewProps<SdView>) {
  const [sel, setSel] = useState<number | null>(null);
  const [pencil, setPencil] = useState(false);
  const elapsed = useElapsed(view, serverNow);
  const playing = view.status === 'playing' && !over;

  const select = (i: number): void => {
    setSel((was) => (was === i ? null : i));
  };

  const digit = (d: number): void => {
    if (sel === null) return; // no cell chosen: a number key does nothing
    if (view.givens[sel] === true) return;
    const x = sel % 9;
    const y = Math.floor(sel / 9);
    move(pencil ? 'note' : 'place', x, y, d);
  };

  const erase = (): void => {
    if (sel === null) return;
    move('erase', sel % 9, Math.floor(sel / 9));
  };

  const note = over
    ? over.text
    : sel === null
      ? 'tap a square, then a number'
      : view.givens[sel] === true
        ? 'that one is a clue — pick a blank square'
        : pencil
          ? 'pencil mode — numbers go in small'
          : 'tap the same number again to rub it out';

  return (
    <div className="sd-screen sd-phone">
      <Hud view={view} elapsed={elapsed} />
      <Grid view={view} sel={sel} onSelect={playing ? select : undefined} />
      {/* always rendered at a fixed height: a line growing here would shove
          the number pad down under the thumb already reaching for it */}
      <p className={over ? 'sd-note sd-over' : 'sd-note'}>{note}</p>
      <Pad
        counts={digitCounts(view.digits)}
        pencil={pencil}
        disabled={!playing}
        onDigit={digit}
        onErase={erase}
        onPencil={() => setPencil((p) => !p)}
      />
    </div>
  );
}
