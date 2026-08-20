import './style.css';
import { useEffect, useRef, useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { WordlyView } from '../game.js';
import { Board, Keyboard, Progress, Standings } from './parts.js';

/** How long a "not in the word list" complaint stays on screen. */
const REJECT_MS = 2500;

export default function HandView({ view, players, over, move, serverNow }: GameViewProps<WordlyView>) {
  // typed letters live only here until ENTER — the server never sees a draft
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const board = view.myIndex >= 0 ? view.boards[view.myIndex] : undefined;
  const used = board?.used ?? 0;
  const finished = board?.finished ?? false;
  const left = view.maxGuesses - used;
  const rejectedAt = view.rejected?.at ?? 0;
  const rejectFresh = rejectedAt > 0 && serverNow - rejectedAt < REJECT_MS;

  // the guess landed: the row is on the board now, so clear the pad
  useEffect(() => {
    setDraft('');
    setSent(null);
  }, [used]);

  // not a word: keep the letters (they're probably nearly right) but shake them
  useEffect(() => {
    if (rejectedAt === 0) return;
    setSent(null);
    setShake(true);
    const t = setTimeout(() => setShake(false), 600);
    return () => clearTimeout(t);
  }, [rejectedAt]);

  // safety net: never leave the keyboard stuck if a poll goes missing
  useEffect(() => {
    if (sent === null) return;
    const t = setTimeout(() => setSent(null), 3000);
    return () => clearTimeout(t);
  }, [sent]);

  const locked = finished || !!over || sent !== null || view.myIndex < 0;
  const submit = () => {
    if (locked || draft.length !== view.wordLength) return;
    setSent(draft);
    move('guess', draft);
  };
  const letter = (ch: string) => {
    if (!locked && draft.length < view.wordLength) setDraft((d) => d + ch);
  };
  const del = () => {
    if (!locked) setDraft((d) => d.slice(0, -1));
  };

  // desktop players expect their real keyboard to work too
  const keyActions = useRef({ submit, letter, del });
  keyActions.current = { submit, letter, del };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        keyActions.current.submit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        keyActions.current.del();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        keyActions.current.letter(e.key.toLowerCase());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!board) {
    return (
      <div className="wl-screen">
        <p className="wl-status">Word Hunt in progress — you're watching.</p>
        <Progress view={view} players={players} />
      </div>
    );
  }

  const status = over
    ? over.text
    : finished
      ? board.solved
        ? `🎉 got it in ${used}!`
        : 'out of tries'
      : rejectFresh
        ? `“${view.rejected?.word ?? ''}” isn't in the word list`
        : `${left} ${left === 1 ? 'try' : 'tries'} left`;

  return (
    <div className="wl-screen">
      <p className={rejectFresh && !finished ? 'wl-status wl-warn' : 'wl-status'}>{status}</p>

      {view.race && <Progress view={view} players={players} skip={view.myIndex} />}

      <Board
        rows={board.rows}
        maxGuesses={view.maxGuesses}
        wordLength={view.wordLength}
        draft={draft}
        shake={shake}
      />

      {finished || over ? (
        <div className="wl-done">
          {view.answer && (
            <p className="wl-answer">
              the word was <strong>{view.answer.toUpperCase()}</strong>
            </p>
          )}
          {view.race &&
            (over ? (
              <Standings view={view} players={players} />
            ) : (
              <p className="wl-status">waiting for the others…</p>
            ))}
        </div>
      ) : (
        <Keyboard
          keys={view.keys}
          disabled={locked}
          canEnter={draft.length === view.wordLength}
          canDelete={draft.length > 0}
          onLetter={letter}
          onEnter={submit}
          onDelete={del}
        />
      )}
    </div>
  );
}
