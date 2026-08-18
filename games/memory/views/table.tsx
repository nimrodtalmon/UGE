import './style.css';
import { useEffect } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { MemoryState } from '../game.js';
import { Confetti, Grid, Scoreboard } from './parts.js';

export default function TableView({ view, over, move }: GameViewProps<MemoryState>) {
  // the table is always present, so it owns flipping mismatches back
  useEffect(() => {
    if (view.mismatch && !over) {
      const t = setTimeout(() => move('resolve'), 1400);
      return () => clearTimeout(t);
    }
  }, [view.mismatch, over, move]);

  const cols = view.cards.length <= 16 ? 4 : 6;
  return (
    <div className="mem-screen">
      <Scoreboard view={view} over={!!over} />
      {over ? (
        <p className="mem-over">{over.text}</p>
      ) : (
        <p className="mem-hint">
          {view.playerNames[view.current]}'s turn — flip here or on their phone
        </p>
      )}
      <Grid view={view} cols={cols} disabled={!!over} onFlip={(i) => move('flip', i)} />
      {over && <Confetti />}
    </div>
  );
}
