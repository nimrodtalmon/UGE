import './style.css';
import { avatarFor } from '../../../src/shared/avatar.js';
import { formatSeconds, useDeadline } from '../../../src/shared/gameKit.js';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { pointsOf, SUITS } from '../game.js';
import type { HeartsView } from '../game.js';
import { CardFace, HandSummary, nameOf, PASS_TEXT, ScoreRow } from './parts.js';

const POS = ['bottom', 'left', 'top', 'right'];

export default function TableView({ view, players, over, move, serverNow }: GameViewProps<HeartsView>) {
  // display-only for gameplay, but the table drives the timer moves
  useDeadline({
    active: !over && view.phase === 'trickEnd',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('clearTrick'),
  });
  const handoverLeft = useDeadline({
    active: !over && view.phase === 'handover',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('nextHand'),
  });

  if (over) {
    return (
      <div className="ht-screen">
        <p className="ht-over">{over.text}</p>
        <ScoreRow view={view} players={players} />
      </div>
    );
  }

  const trickPoints = view.trick.reduce((sum, c) => sum + (c ? pointsOf(c) : 0), 0);
  const status =
    view.phase === 'passing'
      ? `${PASS_TEXT[view.passDir]} — waiting for ${
          view.passed.map((p, i) => (p ? null : nameOf(view, players, i))).filter(Boolean).join(', ') || '…'
        }`
      : view.phase === 'play'
        ? `${nameOf(view, players, view.turn)} plays…${
            view.ledSuit !== null
              ? ` — ${SUITS[view.ledSuit]} led`
              : view.trickNum === 0
                ? ' — the 2♣ opens'
                : ''
          }`
        : view.phase === 'trickEnd'
          ? `${nameOf(view, players, view.trickWinner ?? 0)} takes the trick${
              trickPoints > 0 ? ` (+${trickPoints})` : ''
            }`
          : `next hand in ${formatSeconds(handoverLeft)}s`;

  return (
    <div className="ht-screen">
      <header className="ht-header">
        <span className="ht-handnum">hand {view.handNum + 1}</span>
        {view.phase === 'passing' && <span className="ht-banner">{PASS_TEXT[view.passDir]}</span>}
        <span className={view.heartsBroken ? 'ht-broken on' : 'ht-broken'}>
          💔 hearts {view.heartsBroken ? 'broken' : 'unbroken'}
        </span>
      </header>

      <div className="ht-ring">
        {view.names.map((name, i) => {
          const classes = ['ht-seat', `ht-pos-${POS[i]}`];
          if (view.phase === 'play' && view.turn === i) classes.push('current');
          if (view.phase === 'trickEnd' && view.trickWinner === i) classes.push('winner');
          return (
            <div key={i} className={classes.join(' ')}>
              <span className="ht-avatar">{players[i]?.avatar ?? avatarFor(name)}</span>
              <span className="ht-name">{players[i]?.name ?? name}</span>
              <span className="ht-total">{view.scores[i]}</span>
              {(view.handPoints[i] ?? 0) > 0 && (
                <span className="ht-taken">+{view.handPoints[i]}</span>
              )}
              {view.phase === 'passing' && (
                <span className="ht-passcheck">{view.passed[i] ? '✓' : '…'}</span>
              )}
            </div>
          );
        })}

        <div className="ht-center">
          {view.phase === 'handover' ? (
            <HandSummary view={view} players={players} />
          ) : view.phase === 'passing' ? (
            <p className="ht-pass-big">{PASS_TEXT[view.passDir]}</p>
          ) : (
            <div className="ht-trickring">
              {view.trick.map((card, i) => (
                <div
                  key={i}
                  className={[
                    'ht-trickcard',
                    `ht-pos-${POS[i]}`,
                    view.phase === 'trickEnd' && view.trickWinner === i && 'win',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <CardFace card={card} big />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="ht-status">{status}</p>
    </div>
  );
}
