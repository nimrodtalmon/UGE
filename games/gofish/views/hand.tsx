import './style.css';
import { useEffect, useState } from 'react';
import { useTurnBuzz } from '../../../src/shared/gameKit.js';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { rankLabel } from '../game.js';
import type { GCard, GoFishView } from '../game.js';
import { AskLog, CardFace, Seats, nameOf } from './parts.js';

/** My cards, grouped by rank — asking is always by rank. */
function groupByRank(hand: GCard[]): { rank: number; cards: GCard[] }[] {
  const out: { rank: number; cards: GCard[] }[] = [];
  for (const card of hand) {
    const group = out.find((g) => g.rank === card.r);
    if (group) group.cards.push(card);
    else out.push({ rank: card.r, cards: [card] });
  }
  return out;
}

export default function HandView({ view, players, over, move }: GameViewProps<GoFishView>) {
  const [rank, setRank] = useState<number | null>(null);
  const myTurn = !over && !view.over && view.myIndex >= 0 && view.turn === view.myIndex;
  useTurnBuzz(myTurn);

  // a fresh turn (or a hand that changed under me) clears a stale pick
  useEffect(() => {
    if (!myTurn) setRank(null);
  }, [myTurn]);
  useEffect(() => {
    if (rank !== null && !(view.hand ?? []).some((c) => c.r === rank)) setRank(null);
  }, [view.hand, rank]);

  const last = view.log[view.log.length - 1];
  const status = over
    ? over.text
    : view.myIndex < 0
      ? `${nameOf(view, players, view.turn)} is asking — you're watching`
      : myTurn
        ? rank === null
          ? 'your turn — tap a rank you hold'
          : `ask who for ${rankLabel(rank)}s?`
        : `${nameOf(view, players, view.turn)} is asking…`;

  const beat = last
    ? last.got > 0
      ? `${nameOf(view, players, last.asker)} took ${last.got} ${rankLabel(last.rank)}${last.got > 1 ? 's' : ''} from ${nameOf(view, players, last.target)}`
      : last.drewMatch
        ? `${nameOf(view, players, last.asker)} went fishing and landed the ${rankLabel(last.rank)}`
        : `${nameOf(view, players, last.target)} told ${nameOf(view, players, last.asker)} to go fish`
    : 'the pond is open';

  const groups = groupByRank(view.hand ?? []);

  return (
    <div className="gf-screen gf-phone">
      <Seats
        view={view}
        players={players}
        armed={myTurn && rank !== null}
        onPick={(seat) => {
          if (rank === null) return;
          move('ask', seat, rank);
          setRank(null);
        }}
      />

      <p className={myTurn ? 'gf-status mine' : 'gf-status'}>{status}</p>
      <p className="gf-beat">{over ? '' : beat}</p>

      <div className="gf-tally">
        <span>🐟 pond {view.pondCount}</span>
        <span>📕 books {view.booksMade}/13</span>
        <span>
          mine {view.books[view.myIndex]?.length ?? 0}
          {(view.books[view.myIndex]?.length ?? 0) > 0
            ? ` (${view.books[view.myIndex]!.map(rankLabel).join(' ')})`
            : ''}
        </span>
      </div>

      <div className="gf-handwrap">
        {view.hand === null ? (
          <p className="gf-watching">no hand on this device</p>
        ) : groups.length === 0 ? (
          <p className="gf-watching">your hand is empty</p>
        ) : (
          <div className="gf-hand">
            {groups.map((g) => (
              <button
                key={g.rank}
                className={rank === g.rank ? 'gf-group picked' : 'gf-group'}
                disabled={!myTurn}
                onClick={() => setRank(rank === g.rank ? null : g.rank)}
              >
                {g.cards.map((c) => (
                  <CardFace key={`${c.r}-${c.s}`} card={c} small />
                ))}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* reserved whether or not a rank is picked, so the log never jumps */}
      <div className="gf-ask">
        {myTurn && rank !== null ? (
          <span className="gf-asktext">tap a player above to ask for {rankLabel(rank)}s</span>
        ) : myTurn ? (
          <span className="gf-asktext dim">pick one of your ranks first</span>
        ) : (
          <span className="gf-asktext dim">&nbsp;</span>
        )}
      </div>

      <AskLog view={view} players={players} />
    </div>
  );
}
