import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline } from '../../../src/shared/gameKit.js';
import type { BoggleView } from '../game.js';
import { Counts, Grid, Results, clock } from './parts.js';

/**
 * Display only. The one thing this screen must never do is show a word: it is
 * the screen everybody can see, so it gets counts while the clock runs and the
 * words only once the round is over and they are public anyway.
 */
export default function TableView({ view, players, over, move, serverNow }: GameViewProps<BoggleView>) {
  const playing = view.phase === 'play' && !over;
  const remaining = useDeadline({
    active: playing,
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('timeUp'), // the table drives the whistle
  });

  if (!playing) {
    return (
      <div className="bg-screen bg-table">
        <p className="bg-over">{over?.text ?? 'Time!'}</p>
        <div className="bg-scroll">
          <Results view={view} players={players} wide />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-screen bg-table">
      <p className={remaining <= 15_000 ? 'bg-bigclock bg-hot' : 'bg-bigclock'}>{clock(remaining)}</p>

      <div className="bg-gridwrap">
        <Grid letters={view.letters} size={view.size} path={[]} />
      </div>

      <Counts view={view} players={players} wide />

      <p className="bg-foot">
        Same grid on every phone · {view.minLen}+ letters · a word two people found scores nothing
      </p>
    </div>
  );
}
