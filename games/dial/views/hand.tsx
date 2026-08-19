import './style.css';
import { useEffect, useRef, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import type { DialView } from '../game.js';
import { DialBar, TeamChips, revealText, teamLabel } from './parts.js';

const SEND_EVERY_MS = 350; // throttle setDial to ~3/sec; the table needle follows

export default function HandView({ view, over, move, serverNow }: GameViewProps<DialView>) {
  // phones back up the table's reveal timer (table tab may be backgrounded)
  const remaining = useDeadline({
    active: !over && view.phase === 'reveal',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move('nextRound'),
  });

  // local slider position, sent to the server throttled (trailing value wins)
  const [local, setLocal] = useState(view.dial);
  const lastSent = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // adopt the shared needle when someone else moves it (not mid-drag)
    if (Date.now() - lastSent.current > 2 * SEND_EVERY_MS) setLocal(view.dial);
  }, [view.dial, view.phase]);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const onDial = (v: number) => {
    setLocal(v);
    const send = () => {
      lastSent.current = Date.now();
      move('setDial', v);
    };
    if (pending.current) clearTimeout(pending.current);
    const wait = SEND_EVERY_MS - (Date.now() - lastSent.current);
    if (wait <= 0) send();
    else pending.current = setTimeout(send, wait);
  };

  if (over || view.phase === 'done') {
    return (
      <div className="dl-screen">
        <p className="dl-over">{over?.text ?? 'Done!'}</p>
        <p className="dl-hint">
          🔴 {view.scores[0] ?? 0} — 🔵 {view.scores[1] ?? 0}
        </p>
      </div>
    );
  }

  if (view.phase === 'ready') {
    return (
      <div className="dl-screen">
        <TeamChips view={view} over={false} />
        <h1 className="dl-big">
          Round {view.round + 1}/{view.totalRounds} — {teamLabel(view.round)} team!
        </h1>
        <p className="dl-hint">
          one {view.round % 2 === 0 ? 'red' : 'blue'} player peeks at the target and gives a
          one-word clue — the rest of the team dials
        </p>
        <button className="dl-psychic" onClick={() => move('startRound')}>
          I'm the psychic 🔮
        </button>
      </div>
    );
  }

  if (view.phase === 'clue') {
    return view.iAmPsychic ? (
      <div className="dl-screen">
        <h1 className="dl-big">Your eyes only 🤫</h1>
        <DialBar view={view} needle={null} target={view.target} />
        <p className="dl-hint">
          think of a ONE-WORD clue that points at the 🎯, say it out loud, then tap
        </p>
        <button className="dl-go" onClick={() => move('clueGiven')}>
          Clue given ✓
        </button>
      </div>
    ) : (
      <div className="dl-screen">
        <h1 className="dl-big">🔮 {view.psychicName ?? 'The psychic'} is thinking of a clue…</h1>
        <DialBar view={view} needle={null} />
        <p className="dl-hint">listen up — you'll dial to where their clue lands</p>
      </div>
    );
  }

  if (view.phase === 'guess') {
    return view.iAmPsychic ? (
      <div className="dl-screen">
        <h1 className="dl-big">You gave the clue — hands off! 🙊</h1>
        <DialBar view={view} needle={view.dial} target={view.target} />
        <p className="dl-hint">pass the phone or let your team dial — no hints!</p>
      </div>
    ) : (
      <div className="dl-screen">
        <h1 className="dl-big">Dial it in</h1>
        <DialBar view={view} needle={local} />
        <input
          className="dl-slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={local}
          onChange={(e) => onDial(Number(e.target.value))}
        />
        <button className="dl-lock" onClick={() => move('lockIn')}>
          Lock it in 🔒
        </button>
        <p className="dl-hint">talk it out with your team — where does the clue land?</p>
      </div>
    );
  }

  // reveal
  return (
    <div className="dl-screen">
      <h1 className="dl-big">{revealText(view)}</h1>
      <DialBar view={view} needle={view.guess} target={view.target} />
      <p className="dl-hint">
        target {view.target} · guess {view.guess} — off by {Math.abs((view.target ?? 0) - view.guess)} ·
        next round in {formatSeconds(remaining)}s
      </p>
    </div>
  );
}
