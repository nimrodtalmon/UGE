import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import type { SketchView } from '../game.js';
import { Picture, Scores } from './parts.js';

export default function TableView({ view, players, over, move, serverNow }: GameViewProps<SketchView>) {
  const remaining = useDeadline({
    active: !over && view.phase !== 'done',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move(view.phase === 'draw' ? 'timeUp' : 'next'),
  });

  return (
    <div className="sk-screen">
      <Scores view={view} players={players} />
      {over ? (
        <p className="sk-over">{over.text}</p>
      ) : view.phase === 'reveal' ? (
        <p className="sk-status">
          it was <strong className="sk-word">{view.word}</strong>!
        </p>
      ) : (
        <p className="sk-status">
          round {view.round + 1}/{view.totalRounds} · <span className="sk-hint-word">{view.hint}</span> ·{' '}
          {formatSeconds(remaining)}s
        </p>
      )}
      <Picture view={view} big />
      {view.wrong.length > 0 && view.phase === 'draw' && (
        <p className="sk-wrong">
          {view.wrong.map((w, i) => (
            <span key={i}>
              {w.name}: “{w.text}” &nbsp;
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
