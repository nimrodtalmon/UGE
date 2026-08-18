import type { CodenamesView, Team } from '../game.js';

export function TeamChips({ view }: { view: CodenamesView }) {
  return (
    <div className="cn-chips">
      <span className={view.turn === 'red' && !view.winner ? 'cn-chip red current' : 'cn-chip red'}>
        🔴 {view.remaining.red} left
      </span>
      <span className={view.turn === 'blue' && !view.winner ? 'cn-chip blue current' : 'cn-chip blue'}>
        🔵 {view.remaining.blue} left
      </span>
    </div>
  );
}

export function Board(props: {
  view: CodenamesView;
  mini?: boolean;
  onGuess?: (i: number) => void;
}) {
  const { view } = props;
  return (
    <div className={props.mini ? 'cn-board mini' : 'cn-board'}>
      {view.words.map((word, i) => {
        const kind = view.key[i];
        const classes = ['cn-card'];
        if (view.revealed[i]) classes.push('revealed', `k-${kind}`);
        else if (kind) classes.push('hint', `h-${kind}`);
        return (
          <button
            key={i}
            className={classes.join(' ')}
            disabled={!props.onGuess || view.revealed[i] || !!view.winner}
            onClick={() => props.onGuess?.(i)}
          >
            {word}
          </button>
        );
      })}
    </div>
  );
}

export function TurnBanner({ view, suffix }: { view: CodenamesView; suffix: string }) {
  const t: Team = view.turn;
  return (
    <p className={`cn-turn ${t}`}>
      {t === 'red' ? '🔴 Red' : '🔵 Blue'} team's turn — {suffix}
    </p>
  );
}
