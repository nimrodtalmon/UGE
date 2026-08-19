import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import type { DialView } from '../game.js';
import { DialBar, TeamChips, revealText, teamLabel } from './parts.js';

export default function TableView({ view, over, move, serverNow }: GameViewProps<DialView>) {
  // display-only, but the table drives the reveal timer (idempotent, guarded)
  const remaining = useDeadline({
    active: !over && view.phase === 'reveal',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('nextRound'),
  });

  const psychic = view.psychicName ?? 'the psychic';

  return (
    <div className="dl-screen">
      <TeamChips view={view} over={!!over} />

      {over || view.phase === 'done' ? (
        <p className="dl-over">{over?.text ?? 'Done!'}</p>
      ) : view.phase === 'ready' ? (
        <>
          <h1 className="dl-big">
            Round {view.round + 1} of {view.totalRounds} — {teamLabel(view.round)} team!
          </h1>
          <p className="dl-hint">
            a {view.round % 2 === 0 ? 'red' : 'blue'} player: grab a phone and tap "I'm the psychic 🔮"
          </p>
        </>
      ) : view.phase === 'clue' ? (
        <>
          <h1 className="dl-big">🔮 {psychic} is thinking of a clue…</h1>
          <DialBar view={view} needle={null} />
          <p className="dl-hint">the target is on their phone only — listen for a one-word clue</p>
        </>
      ) : view.phase === 'guess' ? (
        <>
          <h1 className="dl-big">Where did {psychic} mean?</h1>
          <DialBar view={view} needle={view.dial} />
          <p className="dl-hint">
            {teamLabel(view.round)} team: dial it in from your phones, then lock it in
          </p>
        </>
      ) : (
        <>
          <h1 className="dl-big">{revealText(view)}</h1>
          <DialBar view={view} needle={view.guess} target={view.target} />
          <p className="dl-hint">
            target {view.target} · guess {view.guess} — off by {Math.abs((view.target ?? 0) - view.guess)} ·
            next round in {formatSeconds(remaining)}s
          </p>
        </>
      )}
    </div>
  );
}
