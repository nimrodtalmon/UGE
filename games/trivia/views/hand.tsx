import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import type { TriviaView } from '../game.js';

const SHAPES = ['▲', '◆', '●', '■'];

export default function HandView({ view, over, move, serverNow }: GameViewProps<TriviaView>) {
  // phones back up the table's clock — vital when the table tab is backgrounded
  // (e.g. one Android phone hosting the table AND playing)
  const remaining = useDeadline({
    active: !over && view.phase !== 'done',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move(view.phase === 'question' ? 'timeUp' : 'next'),
  });

  if (view.myIndex < 0) {
    return (
      <div className="tv-screen">
        <p className="tv-status">Trivia in progress — you're watching.</p>
      </div>
    );
  }

  if (view.phase === 'done' || over) {
    return (
      <div className="tv-screen">
        <p className="tv-over">{over?.text ?? 'Done!'}</p>
        <p className="tv-status">You scored {view.scores[view.myIndex]} / {view.total}</p>
      </div>
    );
  }

  const answeredRight = view.myAnswer !== null && view.myAnswer === view.correct;
  const verdictClass =
    view.phase === 'reveal' ? `tv-verdict ${answeredRight ? 'right' : 'wrong'}` : 'tv-verdict waiting';

  return (
    <div className="tv-screen tv-phone">
      <p className="tv-progress">
        {view.qIdx + 1} / {view.total}
        {view.phase === 'question' && <span className="tv-clock"> · {formatSeconds(remaining)}s</span>}
      </p>
      <h2 className="tv-question">{view.q}</h2>

      {/* always rendered: "locked in" appearing on tap would push the answer
          tiles down under the finger that just tapped one */}
      <p className={verdictClass}>
        {view.phase === 'reveal'
          ? answeredRight
            ? '+1 — correct! 🎉'
            : view.myAnswer === null
              ? 'too slow ⏱️'
              : 'nope 😅'
          : view.myAnswer !== null
            ? 'Locked in — waiting for the others…'
            : ' '}
      </p>

      <div className="tv-choices tv-tap">
        {view.choices.map((c, i) => {
          const classes = ['tv-choice', `c${i}`];
          if (view.correct !== null) classes.push(i === view.correct ? 'tv-correct' : 'tv-wrong');
          else if (view.myAnswer === i) classes.push('tv-mine');
          return (
            <button
              key={i}
              className={classes.join(' ')}
              disabled={view.phase !== 'question' || view.myAnswer !== null}
              onClick={() => move('answer', i)}
            >
              <span className="tv-letter">{SHAPES[i]}</span> {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}
