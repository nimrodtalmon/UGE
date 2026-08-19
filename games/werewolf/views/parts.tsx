import type { CSSProperties } from 'react';
import type { PlayerInfo } from '../../../src/shared/plugin.js';
import { avatarFor, colorFor } from '../../../src/shared/avatar.js';
import type { Death, WerewolfRole } from '../game.js';

export const roleLabel = (r: WerewolfRole): string =>
  r === 'wolf' ? 'a werewolf 🐺' : r === 'seer' ? 'the seer 🔮' : 'a villager 🧑‍🌾';

export const nameAt = (players: PlayerInfo[], i: number): string =>
  players[i]?.name ?? `Player ${i + 1}`;

export const avatarAt = (players: PlayerInfo[], i: number): string =>
  players[i]?.avatar ?? avatarFor(nameAt(players, i));

/** Big tap targets: one avatar+name button per pickable seat. */
export function PlayerGrid(props: {
  players: PlayerInfo[];
  targets: number[];
  picked: number | null;
  onPick: (i: number) => void;
}) {
  return (
    <div className="ww-grid">
      {props.targets.map((i) => (
        <button
          key={i}
          className={props.picked === i ? 'ww-pick picked' : 'ww-pick'}
          style={{ '--seat': colorFor(i) } as CSSProperties}
          onClick={() => props.onPick(i)}
        >
          <span className="ww-pick-avatar">{avatarAt(props.players, i)}</span>
          <span className="ww-pick-name">{nameAt(props.players, i)}</span>
        </button>
      ))}
    </div>
  );
}

/** Public history: every death names the player and reveals their role. */
export function DeathsLog({ deaths, players }: { deaths: Death[]; players: PlayerInfo[] }) {
  if (deaths.length === 0) return null;
  return (
    <div className="ww-deaths">
      {deaths.map((d, k) => (
        <div key={k} className="ww-death">
          {d.how === 'night' ? '🌙' : '🗳️'} night {d.night} — {avatarAt(players, d.seat)}{' '}
          {d.name} {d.how === 'night' ? 'was killed' : 'was lynched'} · they were {roleLabel(d.role)}
        </div>
      ))}
    </div>
  );
}
