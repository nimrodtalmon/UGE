import './style.css';
import { useEffect } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { MemoryState } from '../game.js';
import { Confetti, Grid, Scoreboard } from './parts.js';

export default function HandView({ view, me, players, over, move }: GameViewProps<MemoryState>) {
  const myIndex = players.findIndex((p) => p.id === me?.id);
  const myTurn = !over && (view.pass || myIndex === view.current);

  useEffect(() => {
    if (myTurn && !view.pass) navigator.vibrate?.(80);
  }, [myTurn, view.pass]);

  // backup resolver in case the table screen is gone mid-game
  useEffect(() => {
    if (myTurn && view.mismatch) {
      const t = setTimeout(() => move('resolve'), 1800);
      return () => clearTimeout(t);
    }
  }, [view.mismatch, myTurn, move]);

  return (
    <div className="mem-screen mem-phone">
      <p className={myTurn ? 'mem-turn mine' : 'mem-turn'}>
        {over
          ? over.text
          : view.pass
            ? `${view.playerNames[view.current]}'s turn — pass & flip!`
            : myTurn
              ? 'Your turn — flip two cards!'
              : `${view.playerNames[view.current]}'s turn…`}
      </p>
      <Scoreboard view={view} players={players} over={!!over} small />
      <Grid view={view} cols={4} disabled={!myTurn} onFlip={(i) => move('flip', i)} />
      {over && <Confetti />}
    </div>
  );
}
