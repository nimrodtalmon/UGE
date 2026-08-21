import { avatarFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import { SUITS, rankLabel } from '../game.js';
import type { AskEntry, GCard, GoFishView } from '../game.js';

/** Bits both role views share: card faces, the seat strip and the ask log. */

export const nameOf = (view: GoFishView, players: PlayerInfo[], seat: number): string =>
  players[seat]?.name ?? view.names[seat] ?? `Player ${seat + 1}`;

export function CardFace({ card, small }: { card: GCard; small?: boolean }) {
  const red = card.s === 1 || card.s === 2;
  return (
    <span className={`gf-card${red ? ' red' : ''}${small ? ' small' : ''}`}>
      <span className="gf-rank">{rankLabel(card.r)}</span>
      <span className="gf-suit">{SUITS[card.s]}</span>
    </span>
  );
}

/** One pill per seat: who, how many cards they hold, how many books they own. */
export function Seats({
  view,
  players,
  onPick,
  armed,
}: {
  view: GoFishView;
  players: PlayerInfo[];
  onPick?: (seat: number) => void;
  armed?: boolean;
}) {
  return (
    <div className="gf-seats">
      {view.names.map((name, seat) => {
        const askable = Boolean(onPick) && armed && seat !== view.myIndex && (view.counts[seat] ?? 0) > 0;
        const classes = ['gf-seat'];
        if (view.turn === seat && !view.over) classes.push('current');
        if (seat === view.myIndex) classes.push('me');
        if (askable) classes.push('askable');
        const body = (
          <>
            <span className="gf-avatar">{players[seat]?.avatar ?? avatarFor(name)}</span>
            <span className="gf-name">{players[seat]?.name ?? name}</span>
            <span className="gf-count">🂠{view.counts[seat] ?? 0}</span>
            <span className="gf-bookcount">📕{view.books[seat]?.length ?? 0}</span>
          </>
        );
        if (askable) {
          return (
            <button key={seat} className={classes.join(' ')} onClick={() => onPick?.(seat)}>
              {body}
            </button>
          );
        }
        return (
          <div key={seat} className={classes.join(' ')}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

function lineFor(view: GoFishView, players: PlayerInfo[], e: AskEntry): string {
  const asker = nameOf(view, players, e.asker);
  const target = nameOf(view, players, e.target);
  const rank = `${rankLabel(e.rank)}s`;
  const head = `${asker} → ${target}: ${rank}`;
  if (e.got > 0) return `${head} — handed over ${e.got}`;
  if (e.drewMatch) return `${head} — go fish… and fished it!`;
  if (e.drew) return `${head} — go fish`;
  return `${head} — go fish (pond empty)`;
}

/** The public record of every ask. Reading it IS the game. */
export function AskLog({ view, players }: { view: GoFishView; players: PlayerInfo[] }) {
  const entries = [...view.log].reverse();
  return (
    <div className="gf-log">
      <p className="gf-logtitle">who asked for what</p>
      <ul className="gf-loglist">
        {entries.length === 0 && <li className="gf-logempty">nobody has asked yet</li>}
        {entries.map((e) => (
          <li key={e.n} className={e.got > 0 ? 'gf-logrow hit' : 'gf-logrow'}>
            <span className="gf-logtext">{lineFor(view, players, e)}</span>
            {e.booked !== null && <span className="gf-logbook">📕 {rankLabel(e.booked)}s</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Books laid down, in seat colours-by-name. */
export function BookStrip({ view, players }: { view: GoFishView; players: PlayerInfo[] }) {
  const any = view.books.some((b) => b.length > 0);
  return (
    <div className="gf-books">
      {!any && <span className="gf-nobooks">no books yet</span>}
      {view.books.map((laid, seat) =>
        laid.map((r) => (
          <span key={`${seat}-${r}`} className={seat === view.myIndex ? 'gf-book mine' : 'gf-book'}>
            {rankLabel(r)}
            <span className="gf-bookwho">{players[seat]?.avatar ?? avatarFor(view.names[seat] ?? '?')}</span>
          </span>
        )),
      )}
    </div>
  );
}
