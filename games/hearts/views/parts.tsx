import { avatarFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import { rankLabel, SUITS } from '../game.js';
import type { HCard, HeartsView, PassDir } from '../game.js';

export const PASS_ARROW: Record<PassDir, string> = { left: '⇐', right: '⇒', across: '⇑', none: '' };
export const PASS_TEXT: Record<PassDir, string> = {
  left: 'pass 3 cards left ⇐',
  right: 'pass 3 cards right ⇒',
  across: 'pass 3 cards across ⇑',
  none: 'no passing this hand',
};

export function CardFace({ card, big }: { card: HCard | null; big?: boolean }) {
  if (!card) return <span className={`ht-card slot${big ? ' big' : ''}`} />;
  const red = card.s === 1 || card.s === 2;
  return (
    <span className={`ht-card${red ? ' red' : ''}${big ? ' big' : ''}`}>
      <span className="ht-rank">{rankLabel(card.r)}</span>
      <span className="ht-suit">{SUITS[card.s]}</span>
    </span>
  );
}

export function nameOf(view: HeartsView, players: PlayerInfo[], i: number): string {
  return players[i]?.name ?? view.names[i] ?? '?';
}

export function ScoreRow({ view, players }: { view: HeartsView; players: PlayerInfo[] }) {
  const passing = view.phase === 'passing';
  return (
    <div className="ht-scores">
      {view.names.map((name, i) => {
        const classes = ['ht-score'];
        if (view.turn === i) classes.push('current');
        if (view.phase === 'trickEnd' && view.trickWinner === i) classes.push('winner');
        return (
          <div key={i} className={classes.join(' ')}>
            <span className="ht-avatar">{players[i]?.avatar ?? avatarFor(name)}</span>
            <span className="ht-name">{players[i]?.name ?? name}</span>
            <span className="ht-total">{view.scores[i]}</span>
            {(view.handPoints[i] ?? 0) > 0 && <span className="ht-taken">+{view.handPoints[i]}</span>}
            {passing && <span className="ht-passcheck">{view.passed[i] ? '✓' : '…'}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** The current trick as a compact strip (phone screens). */
export function TrickStrip({ view, players }: { view: HeartsView; players: PlayerInfo[] }) {
  return (
    <div className="ht-trickstrip">
      {view.trick.map((card, i) => (
        <div
          key={i}
          className={
            view.phase === 'trickEnd' && view.trickWinner === i
              ? 'ht-trickslot win'
              : 'ht-trickslot'
          }
        >
          <span className="ht-mini-avatar">
            {players[i]?.avatar ?? avatarFor(view.names[i] ?? '?')}
          </span>
          <CardFace card={card} />
        </div>
      ))}
    </div>
  );
}

/** The hand's scored damage, shown during handover. */
export function HandSummary({ view, players }: { view: HeartsView; players: PlayerInfo[] }) {
  const summary = view.handSummary;
  if (!summary) return null;
  return (
    <div className="ht-summary">
      {summary.shooter !== null && (
        <p className="ht-moon">🌕 {nameOf(view, players, summary.shooter)} shot the moon!</p>
      )}
      <div className="ht-deltas">
        {view.names.map((_, i) => (
          <span key={i} className="ht-delta">
            {nameOf(view, players, i)} +{summary.deltas[i]}
          </span>
        ))}
      </div>
    </div>
  );
}
