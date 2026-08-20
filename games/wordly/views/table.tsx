import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { WordlyView } from '../game.js';
import { Board, PlayerCard, Standings } from './parts.js';

/**
 * Display-only. In a race the server sends this screen colours but no letters,
 * so the table can't be read over a rival's shoulder; solo, where the only
 * player owns both screens, it mirrors the board.
 */
export default function TableView({ view, players, over }: GameViewProps<WordlyView>) {
  const solo = !view.race && view.boards.length === 1;
  const mine = view.boards[0];

  return (
    <div className="wl-screen wl-table">
      <h2 className="wl-title">🔤 Word Hunt</h2>

      {over ? (
        <p className="wl-over">{over.text}</p>
      ) : solo && mine ? (
        <p className="wl-status">
          {view.maxGuesses - mine.used} {view.maxGuesses - mine.used === 1 ? 'try' : 'tries'} left
        </p>
      ) : (
        <p className="wl-status">same word, first to solve it</p>
      )}

      {solo && mine ? (
        <Board rows={mine.rows} maxGuesses={view.maxGuesses} wordLength={view.wordLength} />
      ) : (
        <div className="wl-cards">
          {view.boards.map((board, i) => (
            <PlayerCard key={i} board={board} view={view} players={players} index={i} />
          ))}
        </div>
      )}

      {view.answer && !solo && (
        <p className="wl-answer">
          the word was <strong>{view.answer.toUpperCase()}</strong>
        </p>
      )}
      {over && view.race && <Standings view={view} players={players} />}
    </div>
  );
}
