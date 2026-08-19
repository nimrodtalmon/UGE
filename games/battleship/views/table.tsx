import './style.css';
import type { GameViewProps } from '../../../src/shared/plugin.js';
import { avatarFor } from '../../../src/shared/avatar.js';
import { SIZE } from '../game.js';
import type { BsView } from '../game.js';
import { BoardGrid, FleetTicker } from './parts.js';

export default function TableView({ view, players, over }: GameViewProps<BsView>) {
  const nameOf = (seat: number): string => players[seat]?.name ?? view.names[seat] ?? '?';
  const avatarOf = (seat: number): string => players[seat]?.avatar ?? avatarFor(nameOf(seat));
  const current = view.current === 1 ? 1 : 0;

  return (
    <div className="bs-screen">
      <p className={over ? 'bs-status over' : 'bs-status'}>
        {over
          ? over.text
          : view.phase === 'place'
            ? `Fleets are being placed… ${view.ready[0] ? '⚓' : '⏳'} ${nameOf(0)} · ${view.ready[1] ? '⚓' : '⏳'} ${nameOf(1)}`
            : `${avatarOf(current)} ${nameOf(current)} is aiming… 🎯`}
      </p>
      <div className="bs-boards">
        {([0, 1] as const).map((seat) => (
          <div
            key={seat}
            className={!over && view.phase === 'play' && seat !== current ? 'bs-side target' : 'bs-side'}
          >
            <h3 className="bs-label">
              {avatarOf(seat)} {nameOf(seat)}'s sea
            </h3>
            <BoardGrid
              board={view.boards[seat]}
              big
              last={
                view.lastShot && view.lastShot.board === seat
                  ? view.lastShot.y * SIZE + view.lastShot.x
                  : null
              }
            />
            <FleetTicker board={view.boards[seat]} />
          </div>
        ))}
      </div>
    </div>
  );
}
