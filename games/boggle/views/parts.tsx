/**
 * Pieces shared by Boggle's two role views. Nothing here imports game.ts as a
 * VALUE — the dictionary lives behind it, and 42,000 words have no business in
 * a phone's view bundle. Types only, plus lib.ts's grid geometry.
 */

import type { CSSProperties } from 'react';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import { colorFor } from '../../../src/shared/avatar.js';
import type { BoggleView } from '../game.js';

/** "QU" is one tile carrying two letters — write it the way Boggle prints it. */
export const faceOf = (letter: string): string => (letter === 'QU' ? 'Qu' : letter);

/** m:ss, from ms remaining. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface GridProps {
  letters: string[];
  size: number;
  /** Tiles of the word being traced, in order. Empty on the table screen. */
  path: number[];
  /** Absent on the table screen, which is display-only. */
  onTap?: (cell: number) => void;
  /** Cells that may legally be tapped next — everything else is dimmed. */
  reachable?: (cell: number) => boolean;
}

export function Grid({ letters, size, path, onTap, reachable }: GridProps) {
  const head = path.length > 0 ? path[path.length - 1] : -1;
  const line = path
    .map((cell) => `${(cell % size) + 0.5},${Math.floor(cell / size) + 0.5}`)
    .join(' ');

  return (
    <div
      className="bo-grid"
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, '--bo-n': size } as CSSProperties}
    >
      {letters.map((letter, cell) => {
        const on = path.includes(cell);
        const classes = ['bo-tile'];
        if (on) classes.push('bo-on');
        if (cell === head) classes.push('bo-head');
        if (!on && reachable && !reachable(cell)) classes.push('bo-far');
        // always a button when this device plays: swapping the element type
        // mid-trace would remount the tile and swallow the tap landing on it
        if (onTap) {
          return (
            <button
              key={cell}
              type="button"
              className={classes.join(' ')}
              onClick={() => onTap(cell)}
              aria-label={`letter ${faceOf(letter)}`}
            >
              {faceOf(letter)}
            </button>
          );
        }
        return (
          <div key={cell} className={classes.join(' ')}>
            {faceOf(letter)}
          </div>
        );
      })}
      {/* the trace, drawn over the tiles but deaf to taps */}
      <svg
        className="bo-trace"
        viewBox={`0 0 ${size} ${size}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {path.length > 1 && (
          <polyline points={line} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </div>
  );
}

/** Public all round long: how many words each player has in — never which. */
export function Counts({
  view,
  players,
  wide,
}: {
  view: BoggleView;
  players: PlayerInfo[];
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'bo-counts bo-wide' : 'bo-counts'}>
      {view.names.map((name, i) => (
        <div
          key={i}
          className={`bo-chip${i === view.myIndex ? ' bo-me' : ''}`}
          style={{ '--seat': colorFor(i) } as CSSProperties}
          title={`${players[i]?.name ?? name}: ${view.counts[i] ?? 0} words`}
        >
          <span className="bo-av">{players[i]?.avatar ?? '🙂'}</span>
          {wide && <span className="bo-who">{players[i]?.name ?? name}</span>}
          <strong>{view.counts[i] ?? 0}</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * The results, once the whistle has blown. The scoring rule is the point of
 * the screen: a word two or more people wrote is struck out for both of them,
 * so the duplicates are shown, not hidden.
 */
export function Results({
  view,
  players,
  wide,
}: {
  view: BoggleView;
  players: PlayerInfo[];
  wide?: boolean;
}) {
  const results = view.results ?? [];
  const ranked = [...results].sort((a, b) => b.points - a.points);

  if (view.solo) {
    const only = results[0];
    return (
      <div className="bo-results">
        <p className="bo-tally">
          You found <strong>{only?.points ?? 0}</strong> of the board's{' '}
          <strong>{view.bestPoints}</strong> points
          <span className="bo-dim">
            {' '}
            · {only?.unique.length ?? 0} of {view.bestCount} words
          </span>
        </p>
        <WordRow label="Your words" words={only?.unique ?? []} />
        {view.missed && view.missed.length > 0 && (
          <WordRow label="On the board, missed" words={view.missed} faded />
        )}
      </div>
    );
  }

  return (
    <div className={wide ? 'bo-results bo-wide' : 'bo-results'}>
      {ranked.map((r) => (
        <div key={r.seat} className={`bo-card${r.seat === view.myIndex ? ' bo-me' : ''}`}>
          <div className="bo-cardhead" style={{ '--seat': colorFor(r.seat) } as CSSProperties}>
            <span className="bo-av">{players[r.seat]?.avatar ?? '🙂'}</span>
            <span className="bo-who">{players[r.seat]?.name ?? view.names[r.seat] ?? '?'}</span>
            <strong>{r.points}</strong>
          </div>
          <WordRow label="" words={r.unique} />
          {r.dupes.length > 0 && (
            <p className="bo-dupes">
              <span className="bo-dim">everyone had: </span>
              {r.dupes.map((w) => (
                <s key={w}>{w}</s>
              ))}
            </p>
          )}
          {r.unique.length === 0 && r.dupes.length === 0 && <p className="bo-dim">nothing</p>}
        </div>
      ))}
      {view.missed && view.missed.length > 0 && (
        <WordRow label="Nobody found" words={view.missed} faded />
      )}
    </div>
  );
}

function WordRow({
  label,
  words,
  faded,
}: {
  label: string;
  words: { word: string; points: number }[];
  faded?: boolean;
}) {
  return (
    <p className={faded ? 'bo-words bo-faded' : 'bo-words'}>
      {label && <span className="bo-dim">{label}: </span>}
      {words.length === 0 && <span className="bo-dim">—</span>}
      {words.map((w) => (
        <span key={w.word} className="bo-word-chip">
          {w.word}
          <sup>{w.points}</sup>
        </span>
      ))}
    </p>
  );
}
