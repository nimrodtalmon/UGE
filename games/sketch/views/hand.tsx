import './style.css';
import { useEffect, useRef, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline, formatSeconds } from '../../../src/shared/gameKit.js';
import type { SketchView } from '../game.js';
import { Picture, Scores } from './parts.js';

const PALETTE = ['#222222', '#c0392b', '#2a6fc0', '#27965a', '#d1a02a'];

function DrawPad(props: { color: string; onStroke: (points: number[]) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [current, setCurrent] = useState<number[]>([]);
  const drawing = useRef(false);

  const toLocal = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    const x = ((e.clientX - box.left) / box.width) * 1000;
    const y = ((e.clientY - box.top) / box.height) * 1000;
    if (x < 0 || y < 0 || x > 1000 || y > 1000) return null;
    return [Math.round(x), Math.round(y)];
  };

  const finish = () => {
    if (drawing.current && current.length >= 4) {
      props.onStroke(current.length > 400 ? current.filter((_, i) => i % 2 === 0 || i < 4) : current);
    }
    drawing.current = false;
    setCurrent([]);
  };

  return (
    <svg
      ref={ref}
      className="sk-pad"
      viewBox="0 0 1000 1000"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const pt = toLocal(e);
        if (pt) {
          drawing.current = true;
          setCurrent(pt);
        }
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const pt = toLocal(e);
        if (pt) setCurrent((c) => [...c, ...pt]);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {current.length >= 4 && (
        <polyline
          points={Array.from({ length: current.length / 2 }, (_, j) => `${current[j * 2]},${current[j * 2 + 1]}`).join(' ')}
          fill="none"
          stroke={props.color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export default function HandView({ view, players, over, move, serverNow }: GameViewProps<SketchView>) {
  const [color, setColor] = useState(PALETTE[0]!);
  const [draft, setDraft] = useState('');
  const [rejected, setRejected] = useState(false);
  const remaining = useDeadline({
    active: !over && view.phase !== 'done',
    endsAt: view.endsAt,
    serverNow,
    onExpire: () => move(view.phase === 'draw' ? 'timeUp' : 'next'),
  });
  const iDraw = view.myIndex === view.drawer;

  useEffect(() => setDraft(''), [view.round]);
  useEffect(() => {
    if (rejected) {
      const t = setTimeout(() => setRejected(false), 1200);
      return () => clearTimeout(t);
    }
  }, [rejected]);

  if (over || view.phase === 'done') {
    return (
      <div className="sk-screen">
        <p className="sk-over">{over?.text ?? 'Done!'}</p>
        <Scores view={view} players={players} />
      </div>
    );
  }

  if (view.myIndex < 0) {
    return (
      <div className="sk-screen">
        <p className="sk-status">Sketch in progress — you're watching.</p>
        <Picture view={view} />
      </div>
    );
  }

  if (view.phase === 'reveal') {
    return (
      <div className="sk-screen">
        <p className="sk-status">
          it was <strong className="sk-word">{view.word}</strong>!
        </p>
        <Picture view={view} />
      </div>
    );
  }

  if (iDraw) {
    return (
      <div className="sk-screen sk-drawing">
        <p className="sk-status">
          draw: <strong className="sk-word">{view.word}</strong> · {formatSeconds(remaining)}s
        </p>
        <div className="sk-stack">
          <Picture view={view} />
          <DrawPad color={color} onStroke={(points) => move('stroke', color, points)} />
        </div>
        <div className="sk-tools">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={c === color ? 'sk-color on' : 'sk-color'}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <button className="sk-clear" onClick={() => move('clear')}>
            clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sk-screen">
      <p className="sk-status">
        <span className="sk-hint-word">{view.hint}</span> · {formatSeconds(remaining)}s
      </p>
      <Picture view={view} />
      {view.iGuessed ? (
        <p className="sk-right">you got it! ✓</p>
      ) : (
        <div className="sk-guessrow">
          <input
            className={rejected ? 'sk-guess shake' : 'sk-guess'}
            placeholder="your guess…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                move('guess', draft.trim());
                setRejected(true);
                setDraft('');
              }
            }}
          />
          <button
            className="primary"
            disabled={!draft.trim()}
            onClick={() => {
              move('guess', draft.trim());
              setRejected(true);
              setDraft('');
            }}
          >
            Guess
          </button>
        </div>
      )}
    </div>
  );
}
