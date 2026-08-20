import type { CSSProperties } from 'react';
import { avatarFor } from '../../../src/shared/avatar.js';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import type { Mark, ViewBoard, ViewRow, WordlyView } from '../game.js';

const MARK_CLASS: Record<Mark, string> = {
  green: 'wl-green',
  yellow: 'wl-yellow',
  grey: 'wl-grey',
};

/**
 * The board. Rows already played come back from the server; `draft` is what
 * this phone is typing right now and never leaves the device until ENTER.
 * A row whose `word` is null renders as bare colour — that's how the table
 * shows a rival's progress without leaking their letters.
 */
export function Board(props: {
  rows: ViewRow[];
  maxGuesses: number;
  wordLength: number;
  draft?: string;
  shake?: boolean;
  small?: boolean;
}) {
  const { rows, maxGuesses, wordLength, draft = '', shake = false, small = false } = props;
  return (
    <div className={small ? 'wl-board wl-small' : 'wl-board'}>
      {Array.from({ length: maxGuesses }, (_, r) => {
        const done: ViewRow | undefined = rows[r];
        const typing = !done && r === rows.length;
        return (
          <div key={r} className={typing && shake ? 'wl-row wl-shake' : 'wl-row'}>
            {Array.from({ length: wordLength }, (_, c) => {
              const mark = done?.marks[c];
              const letter = done ? (done.word?.[c] ?? '') : typing ? (draft[c] ?? '') : '';
              const cls = [
                'wl-tile',
                done && 'wl-flip',
                mark && MARK_CLASS[mark],
                !done && letter && 'wl-filled',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={c} className={cls} style={{ '--i': c } as CSSProperties}>
                  {letter}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** Our own keyboard: a native one would cover half the board on a phone. */
export function Keyboard(props: {
  keys: Record<string, Mark>;
  disabled: boolean;
  canEnter: boolean;
  canDelete: boolean;
  onLetter: (letter: string) => void;
  onEnter: () => void;
  onDelete: () => void;
}) {
  const letterKey = (letter: string) => {
    const mark = props.keys[letter];
    return (
      <button
        key={letter}
        type="button"
        className={mark ? `wl-key ${MARK_CLASS[mark]}` : 'wl-key'}
        disabled={props.disabled}
        onClick={() => props.onLetter(letter)}
      >
        {letter}
      </button>
    );
  };

  return (
    <div className="wl-keyboard">
      <div className="wl-keyrow">{[...(KEY_ROWS[0] ?? '')].map(letterKey)}</div>
      <div className="wl-keyrow">
        <span className="wl-half" />
        {[...(KEY_ROWS[1] ?? '')].map(letterKey)}
        <span className="wl-half" />
      </div>
      <div className="wl-keyrow">
        <button
          type="button"
          className="wl-key wl-wide"
          disabled={props.disabled || !props.canEnter}
          onClick={props.onEnter}
        >
          ENTER
        </button>
        {[...(KEY_ROWS[2] ?? '')].map(letterKey)}
        <button
          type="button"
          className="wl-key wl-wide"
          disabled={props.disabled || !props.canDelete}
          onClick={props.onDelete}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

const avatarOf = (players: PlayerInfo[], name: string, index?: number) =>
  (index !== undefined ? players[index]?.avatar : players.find((p) => p.name === name)?.avatar) ??
  avatarFor(name);

/** Rivals' progress: how far along, nothing about which letters they tried. */
export function Progress({
  view,
  players,
  skip,
}: {
  view: WordlyView;
  players: PlayerInfo[];
  skip?: number;
}) {
  return (
    <div className="wl-progress">
      {view.boards.map((board, i) =>
        i === skip ? null : (
          <span
            key={i}
            className={board.solved ? 'wl-chip wl-won' : board.finished ? 'wl-chip wl-out' : 'wl-chip'}
          >
            <span>{avatarOf(players, board.name, i)}</span>
            <span className="wl-chipname">{board.name}</span>
            <strong>
              {board.solved ? `✓ ${board.used}` : board.finished ? '✗' : `${board.used}/${view.maxGuesses}`}
            </strong>
          </span>
        ),
      )}
    </div>
  );
}

export function Standings({ view, players }: { view: WordlyView; players: PlayerInfo[] }) {
  return (
    <ol className="wl-standings">
      {view.standings.map((s, i) => (
        <li key={`${s.name}-${i}`}>
          <span className="wl-rank">{i + 1}</span>
          <span>{avatarOf(players, s.name)}</span>
          <span className="wl-chipname">{s.name}</span>
          <strong>{s.solved ? `${s.used} ${s.used === 1 ? 'try' : 'tries'}` : 'no luck'}</strong>
        </li>
      ))}
    </ol>
  );
}

/** A player's board plus their name — the table's per-player card in a race. */
export function PlayerCard({
  board,
  view,
  players,
  index,
}: {
  board: ViewBoard;
  view: WordlyView;
  players: PlayerInfo[];
  index: number;
}) {
  return (
    <div className={board.solved ? 'wl-card wl-won' : board.finished ? 'wl-card wl-out' : 'wl-card'}>
      <div className="wl-cardhead">
        <span>{avatarOf(players, board.name, index)}</span>
        <span className="wl-chipname">{board.name}</span>
        <strong>
          {board.solved ? `✓ ${board.used}` : board.finished ? '✗' : `${board.used}/${view.maxGuesses}`}
        </strong>
      </div>
      <Board rows={board.rows} maxGuesses={view.maxGuesses} wordLength={view.wordLength} small />
    </div>
  );
}
