import './style.css';
import { useEffect, useRef, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { useDeadline } from '../../../src/shared/gameKit.js';
import { isAdjacent, scoreWord } from '../lib.js';
import type { BoggleView } from '../game.js';
import { Counts, Grid, Results, clock, faceOf } from './parts.js';

/** How long the last word's verdict stays on the reserved line. */
const VERDICT_MS = 2_600;

export default function HandView({ view, players, me, over, move, serverNow }: GameViewProps<BoggleView>) {
  // the word being traced lives only on this phone — the server sees it on ✓
  const [path, setPath] = useState<number[]>([]);
  const playing = view.phase === 'play' && !over;

  const remaining = useDeadline({
    active: playing,
    endsAt: view.endsAt,
    serverNow,
    // phones back up the table's whistle — and there may be no table at all
    onExpire: () => move('timeUp'),
  });

  // a new grid (or the whistle) drops whatever was half-traced
  useEffect(() => {
    if (!playing) setPath([]);
  }, [playing]);

  // the word landed (or bounced): start the next one from scratch
  const stamp = view.last?.at ?? 0;
  useEffect(() => setPath([]), [stamp]);

  const word = path.map((cell) => view.letters[cell] ?? '').join('');
  const spectator = view.myIndex < 0;
  const canSend = playing && !spectator && word.length >= view.minLen;

  const tap = (cell: number) => {
    if (!playing || spectator) return;
    const last = path.length > 0 ? path[path.length - 1] : undefined;
    if (last === cell) {
      setPath(path.slice(0, -1)); // tap the head again to take it back
      return;
    }
    if (path.includes(cell)) return; // a tile cannot be used twice
    if (last !== undefined && !isAdjacent(view.size, last, cell)) return;
    setPath([...path, cell]);
  };

  const undo = () => setPath((p) => p.slice(0, -1));
  const send = () => {
    if (!canSend) return;
    move('submit', word.toLowerCase());
    setPath([]);
  };

  // a real keyboard is nice on a laptop; the grid is still tapped, not typed
  const keys = useRef({ send, undo });
  keys.current = { send, undo };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        keys.current.send();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        keys.current.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const last = view.last;
  const fresh = last !== null && serverNow - last.at < VERDICT_MS;
  const verdict = (): { text: string; tone: string } => {
    if (path.length > 0) {
      if (word.length < view.minLen) return { text: `${view.minLen} letters or more`, tone: 'bo-dim' };
      const n = scoreWord(word);
      return { text: `worth ${n} point${n === 1 ? '' : 's'}`, tone: 'bo-dim' };
    }
    if (!fresh || last === null) return { text: ' ', tone: 'bo-dim' };
    const quoted = `“${last.word}”`;
    if (last.reason === null) return { text: `${quoted} +${last.points}`, tone: 'bo-good' };
    if (last.reason === 'short') return { text: `${quoted} is too short`, tone: 'bo-bad' };
    if (last.reason === 'dup') return { text: `${quoted} — you have that already`, tone: 'bo-bad' };
    if (last.reason === 'path') return { text: `${quoted} isn't on this grid`, tone: 'bo-bad' };
    return { text: `${quoted} isn't in the word list`, tone: 'bo-bad' };
  };
  const v = verdict();

  // ---- after the whistle
  if (!playing) {
    return (
      <div className="bo-screen">
        <p className="bo-over">{over?.text ?? 'Time!'}</p>
        <div className="bo-scroll">
          <Results view={view} players={players} />
        </div>
      </div>
    );
  }

  return (
    <div className="bo-screen">
      <div className="bo-hud">
        <span className={remaining <= 15_000 ? 'bo-clock bo-hot' : 'bo-clock'}>{clock(remaining)}</span>
        <Counts view={view} players={players} />
      </div>

      <p className={`bo-verdict ${v.tone}`}>{v.text}</p>

      <p className="bo-wordline">
        {path.length === 0 ? (
          <span className="bo-hint">{spectator ? "you're watching" : 'tap letters that touch'}</span>
        ) : (
          path.map((cell, i) => (
            <span key={i} className="bo-word-letter">
              {faceOf(view.letters[cell] ?? '')}
            </span>
          ))
        )}
      </p>

      <div className="bo-gridwrap">
        <Grid
          letters={view.letters}
          size={view.size}
          path={path}
          onTap={spectator ? undefined : tap}
          reachable={(cell) => {
            const last2 = path.length > 0 ? path[path.length - 1] : undefined;
            return last2 === undefined || isAdjacent(view.size, last2, cell);
          }}
        />
      </div>

      <div className="bo-keys">
        <button type="button" className="bo-key" disabled={path.length === 0} onClick={undo}>
          ⌫
        </button>
        <button type="button" className="bo-key bo-go" disabled={!canSend} onClick={send}>
          ✓ {word.length > 0 ? word.toLowerCase() : 'submit'}
        </button>
      </div>

      <div className="bo-found">
        <span className="bo-dim">
          {spectator
            ? `${me?.name ?? 'you'} — no seat this round`
            : `${view.myWords.length} word${view.myWords.length === 1 ? '' : 's'} · ${view.myRaw} points so far`}
        </span>
        {[...view.myWords].reverse().map((w) => (
          <span key={w} className="bo-word-chip">
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}
