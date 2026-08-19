import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import { avatarFor } from '../../../src/shared/avatar.js';
import type { LdView } from '../game.js';

const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const WORDS = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three',
  'twenty-four', 'twenty-five', 'twenty-six', 'twenty-seven', 'twenty-eight',
  'twenty-nine', 'thirty',
];
const numberWord = (n: number) => WORDS[n - 1] ?? String(n);

export default function TableView({ view, players, over, move, serverNow }: GameViewProps<LdView>) {
  // the table drives the pause after a reveal
  const remaining = useDeadline({
    active: !over && view.phase === 'reveal',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('nextRound'),
  });

  const bid = view.bid;
  const bidding = !over && view.phase === 'bidding';

  return (
    <div className="ld-screen">
      <div className="ld-seats">
        {view.seats.map((seat, i) => (
          <div
            key={i}
            className={`ld-seat${bidding && i === view.turn ? ' current' : ''}${seat.out ? ' out' : ''}`}
          >
            <span className="ld-avatar">{players[i]?.avatar ?? avatarFor(view.names[i] ?? '?')}</span>
            <span className="ld-name">{players[i]?.name ?? view.names[i]}</span>
            {seat.out ? (
              <span className="ld-tag">out</span>
            ) : (
              <span className="ld-backs">
                {Array.from({ length: seat.count }, (_, j) => (
                  <span key={j} className="ld-dieback">?</span>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>

      {over ? (
        <div className="ld-pit">
          <p className="ld-result">{over.text}</p>
        </div>
      ) : view.phase === 'reveal' ? (
        <div className="ld-pit">
          <div className="ld-reveal">
            {view.seats.map((seat, i) =>
              seat.count > 0 ? (
                <div key={i} className="ld-reveal-row">
                  <span className="ld-reveal-name">{players[i]?.name ?? view.names[i]}</span>
                  <span className="ld-reveal-dice">
                    {seat.dice?.map((d, j) => (
                      <span
                        key={j}
                        className={`ld-die big${bid && (d === bid.face || d === 1) ? ' hit' : ''}`}
                      >
                        {DIE[d - 1]}
                      </span>
                    ))}
                  </span>
                </div>
              ) : null,
            )}
          </div>
          {bid && (
            <p className="ld-tally">
              {view.tally} × {DIE[bid.face - 1]} on the table (1s are wild) — the bid was{' '}
              {numberWord(bid.quantity)} {DIE[bid.face - 1]}
            </p>
          )}
          <p className="ld-verdict">
            {view.names[view.challenger]} called liar —{' '}
            <strong>{view.names[view.loser]} loses a die</strong>
            <span className="ld-next"> · next round in {formatSeconds(remaining)}s</span>
          </p>
        </div>
      ) : (
        <div className="ld-pit">
          {bid ? (
            <p className="ld-bid-huge">
              {numberWord(bid.quantity)} <span className="ld-bid-die">{DIE[bid.face - 1]}</span>
            </p>
          ) : (
            <p className="ld-bid-none">waiting for the first bid…</p>
          )}
          {bid && <p className="ld-bidder">bid by {view.names[view.bidder]}</p>}
          <p className="ld-turn">{players[view.turn]?.name ?? view.names[view.turn]} to act</p>
          <p className="ld-hint">{view.totalDice} dice in play</p>
        </div>
      )}
    </div>
  );
}
