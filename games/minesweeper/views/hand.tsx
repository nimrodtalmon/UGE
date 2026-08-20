import './style.css';
import { useState } from 'react';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import type { MsView } from '../game.js';
import { Board, Header, useElapsed } from './parts.js';

type Tool = 'dig' | 'flag';

export default function HandView({ view, over, move, serverNow }: GameViewProps<MsView>) {
  const [tool, setTool] = useState<Tool>('dig');
  const [confirming, setConfirming] = useState(false);
  const elapsed = useElapsed(view, serverNow);
  const playing = view.status === 'playing';

  const tap = (x: number, y: number): void => {
    setConfirming(false);
    if (tool === 'flag') {
      move('flag', x, y);
      return;
    }
    const cell = view.cells[y * view.w + x];
    // tapping a satisfied number opens its neighbours — the classic shortcut
    if (cell?.revealed && cell.count > 0) move('chord', x, y);
    else move('reveal', x, y);
  };

  const hold = (x: number, y: number): void => {
    setConfirming(false);
    move('flag', x, y);
  };

  const restart = (): void => {
    if (confirming) {
      move('restart');
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  const hint =
    view.startedAt === null
      ? 'first tap is always safe'
      : tool === 'flag'
        ? 'flag mode — tap a covered cell'
        : 'dig mode — long-press to flag';

  // one reserved line, three jobs: restart confirm, post-game pointer, spacer
  const note = confirming
    ? 'tap the arrows again to wipe this run'
    : playing
      ? ' '
      : 'use "Play again" for a fresh board';

  return (
    <div className="ms-screen ms-phone">
      <Header view={view} elapsed={elapsed}>
        <button className="ms-restart" disabled={!playing} onClick={restart}>
          🔄
        </button>
      </Header>

      {/* always rendered: a line appearing on tap would shove the board down
          under the finger that is about to tap it again */}
      <p className={`ms-confirm${confirming ? ' on' : playing ? '' : ' hint'}`}>{note}</p>

      <Board view={view} onTap={tap} onHold={hold} />

      <p className={over ? 'ms-status over' : 'ms-status'}>{over ? over.text : hint}</p>

      <div className="ms-tools" role="group" aria-label="tool">
        <button
          className={tool === 'dig' ? 'ms-tool on' : 'ms-tool'}
          disabled={!playing}
          onClick={() => setTool('dig')}
        >
          ⛏ dig
        </button>
        <button
          className={tool === 'flag' ? 'ms-tool on' : 'ms-tool'}
          disabled={!playing}
          onClick={() => setTool('flag')}
        >
          🚩 flag
        </button>
      </div>
    </div>
  );
}
