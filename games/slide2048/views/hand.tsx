import './style.css';
import { useEffect, useRef, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { Direction, Slide2048View } from '../game.js';
import { Banner, Board, Stats } from './parts.js';

/** Below this the gesture is a tap, not a swipe. */
const THRESHOLD = 24;

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

export default function HandView({ view, over, move }: GameViewProps<Slide2048View>) {
  const start = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // swiping must never scroll or rubber-band the page under the finger
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, []);

  // desktop: arrow keys / WASD
  useEffect(() => {
    if (over) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key];
      if (!dir || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      move('slide', dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over, move]);

  // the restart guard disarms itself, so a forgotten tap can't wipe a run later
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  /**
   * Fire the moment the gesture is unmistakable, not on lift — waiting for
   * pointerup makes every swipe feel a beat late. One slide per gesture.
   */
  const track = (x: number, y: number) => {
    const from = start.current;
    if (!from || from.fired || over) return;
    const dx = x - from.x;
    const dy = y - from.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < THRESHOLD) return;
    // an ambiguous diagonal waits until one axis clearly wins
    if (Math.abs(ax - ay) < THRESHOLD / 3) return;
    from.fired = true;
    const dir: Direction = ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    move('slide', dir);
  };

  const restart = () => {
    // nothing to lose before the first move, or once the run is finished
    if (over || view.moves === 0 || confirming) {
      setConfirming(false);
      move('restart');
      return;
    }
    setConfirming(true);
  };

  return (
    <div className="sl-screen">
      <Stats view={view} />
      <Banner view={view} over={over} />
      <div
        className="sl-pad"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { x: e.clientX, y: e.clientY, fired: false };
        }}
        onPointerMove={(e) => track(e.clientX, e.clientY)}
        onPointerUp={(e) => {
          track(e.clientX, e.clientY); // a fast flick can skip every move event
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <Board view={view} />
      </div>
      <p className="sl-hint">{over ? 'no moves left' : 'swipe to slide — equal tiles merge'}</p>
      {/* always rendered: a line appearing on tap would shove the button down
          under the finger that is about to tap it again */}
      <p className="sl-confirm">{confirming ? 'tap again to restart — this run is lost' : ' '}</p>
      <button className={confirming ? 'sl-new sl-armed' : 'sl-new'} onClick={restart}>
        New game
      </button>
    </div>
  );
}
