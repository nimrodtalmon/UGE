import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import type { WerewolfView } from '../game.js';
import { DeathsLog, PlayerGrid, nameAt, roleLabel } from './parts.js';

export default function HandView({ view, players, over, move, serverNow }: GameViewProps<WerewolfView>) {
  // phones back up the table's day clock (double fire is a no-op)
  const remaining = useDeadline({
    active: !over && view.phase === 'day',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('startVote'),
  });

  const seats = view.alive.map((_, i) => i);
  const aliveSeats = seats.filter((i) => view.alive[i]);
  const me = view.myIndex;
  const roleClass = view.myRole ? `ww-rolecard ${view.myRole}` : 'ww-rolecard';

  if (over) {
    return (
      <div className="ww-screen">
        <p className="ww-over">{over.text}</p>
        {view.myRole && <p className="ww-hint">you were {roleLabel(view.myRole)}</p>}
        <DeathsLog deaths={view.deaths} players={players} />
      </div>
    );
  }

  if (me < 0) {
    return (
      <div className="ww-screen">
        <p className="ww-hint">Werewolf in progress — you're watching.</p>
        <DeathsLog deaths={view.deaths} players={players} />
      </div>
    );
  }

  // dead: public info only — no roles of the living
  if (!view.alive[me]) {
    return (
      <div className="ww-screen">
        <h1 className="ww-banner">you are dead 💀</h1>
        <p className="ww-hint">no spoilers — watch the village from beyond</p>
        {view.myRole && <p className="ww-hint">you were {roleLabel(view.myRole)}</p>}
        <DeathsLog deaths={view.deaths} players={players} />
      </div>
    );
  }

  if (view.phase === 'reveal') {
    const readyCount = seats.filter((i) => view.alive[i] && view.ready[i]).length;
    return (
      <div className="ww-screen">
        <div className={roleClass}>
          <span className="ww-role-title">you are {view.myRole ? roleLabel(view.myRole) : '…'}</span>
          {view.myRole === 'wolf' && (
            <span className="ww-role-sub">
              {view.myWolfMates && view.myWolfMates.length > 0
                ? `your pack: ${view.myWolfMates.map((w) => nameAt(players, w)).join(' & ')}`
                : 'you hunt alone'}
            </span>
          )}
          {view.myRole === 'seer' && <span className="ww-role-sub">each night, learn one player's true nature</span>}
          {view.myRole === 'villager' && <span className="ww-role-sub">find the wolves before they find you</span>}
        </div>
        <p className="ww-hint">keep it secret — don't show your phone!</p>
        {/* fixed-height slot: button and confirmation must occupy the same space */}
        <div className="ww-slot">
          {view.ready[me] ? (
            <p className="ww-hint">
              ✓ ready — waiting for the others ({readyCount}/{aliveSeats.length})
            </p>
          ) : (
            <button className="ww-ready" onClick={() => move('ready')}>
              Ready 🌙
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view.phase === 'night') {
    if (view.myRole === 'wolf') {
      const mates = view.myWolfMates ?? [];
      const targets = aliveSeats.filter((i) => i !== me && !mates.includes(i));
      return (
        <div className="ww-screen">
          <h1 className="ww-banner">night {view.night} 🐺</h1>
          {/* two lines held: this text grows on every pick, and the column is
              centred — a reflow slides the grid out from under the thumb */}
          <p className="ww-hint hold2">
            {view.myPick === null ? 'choose tonight\'s victim' : 'you can retap to change your mind'} (
            {view.wolvesPicked}/{view.wolvesAlive} wolves have chosen)
          </p>
          <PlayerGrid players={players} targets={targets} picked={view.myPick} onPick={(i) => move('wolfPick', i)} />
          <p className="ww-hint hold1">
            {view.myPick !== null
              ? `waiting for ${view.wolvesPicked < view.wolvesAlive ? 'the rest of the pack' : 'the night to pass'}…`
              : ' '}
          </p>
        </div>
      );
    }
    if (view.myRole === 'seer') {
      const last = view.seerResults?.filter((r) => r.night === view.night).at(-1) ?? null;
      return (
        <div className="ww-screen">
          <h1 className="ww-banner">night {view.night} 🔮</h1>
          {view.myPeeked ? (
            <>
              {last && (
                <p className="ww-result">
                  {nameAt(players, last.target)} is {last.isWolf ? 'A WOLF 🐺' : 'not a wolf ✅'}
                </p>
              )}
              <p className="ww-hint">the vision fades — wait for morning…</p>
            </>
          ) : (
            <>
              <p className="ww-hint">whose true nature do you inspect tonight?</p>
              <PlayerGrid
                players={players}
                targets={aliveSeats.filter((i) => i !== me)}
                picked={null}
                onPick={(i) => move('seerPeek', i)}
              />
            </>
          )}
          {view.seerResults && view.seerResults.length > 0 && (
            <div className="ww-deaths">
              {view.seerResults.map((r, k) => (
                <div key={k} className="ww-death">
                  🔮 night {r.night} — {nameAt(players, r.target)}: {r.isWolf ? 'wolf 🐺' : 'not a wolf'}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="ww-screen">
        <h1 className="ww-banner">night {view.night} 😴</h1>
        <p className="ww-hint">the village sleeps — keep your eyes closed…</p>
      </div>
    );
  }

  if (view.phase === 'day') {
    const killed = view.deaths.find((d) => d.night === view.night && d.how === 'night');
    return (
      <div className="ww-screen">
        <h1 className="ww-banner">day {view.night} ☀️</h1>
        {killed && (
          <p className="ww-hint">
            {killed.name} was killed in the night — they were {roleLabel(killed.role)}
          </p>
        )}
        <div className="ww-clock">{formatSeconds(remaining)}</div>
        <p className="ww-hint">discuss! who is acting suspicious?</p>
      </div>
    );
  }

  // vote
  const myVote = view.votes[me] ?? null;
  const voted = aliveSeats.filter((i) => view.votes[i] !== null).length;
  return (
    <div className="ww-screen">
      <h1 className="ww-banner">the village votes 🗳️</h1>
      {/* two lines held: the tail appears on your first vote and would push the
          grid + skip button down mid-tap */}
      <p className="ww-hint hold2">
        votes are public — {voted}/{aliveSeats.length} cast
        {myVote !== null && ' · tap again to change'}
      </p>
      <PlayerGrid
        players={players}
        targets={aliveSeats}
        picked={myVote !== null && myVote >= 0 ? myVote : null}
        onPick={(i) => move('vote', i)}
      />
      <button className={myVote === -1 ? 'ww-skip picked' : 'ww-skip'} onClick={() => move('vote', null)}>
        Skip — lynch nobody
      </button>
    </div>
  );
}
