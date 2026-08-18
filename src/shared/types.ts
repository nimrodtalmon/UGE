/** Types shared between the brain (server) and all clients. */

import type { GameResult, PlayerInfo } from './plugin.js';

export type RoleRequirement = 'required' | 'optional' | 'none';
export type HandMode = 'per-player' | 'per-team' | 'none';

/** games/<id>/manifest.json — the plugin contract's metadata half. */
export interface Manifest {
  id: string;
  name: string;
  players: { min: number; max: number };
  roles: { table: RoleRequirement; hand: HandMode; extras: string[] };
  pieces?: { static: number; dynamic: number };
  /** Emoji shown on the lobby's game box. */
  icon?: string;
  /** One-liner shown on the lobby's game box. */
  tagline?: string;
  /**
   * Minimum client devices needed, when fewer than one per player works
   * (e.g. Codenames: one spymasters device + one shared guessing phone).
   * Default: one per player when hand is per-player, plus one per extra role.
   */
  phones?: { min: number };
}

/** The group declared on the table before anyone joins ("game night setup"). */
export interface GroupSetup {
  players: number;
  phones: number;
}

export interface DeviceTile {
  id: string;
  name: string;
  avatar: string;
  isTableScreen: boolean;
  role: string | null;
  /** Stopped polling recently (locked phone, backgrounded tab) but not yet dropped. */
  away: boolean;
}

export interface GameEntry {
  manifest: Manifest;
  feasible: boolean;
  reason?: string;
}

export type LobbyPhase = 'lobby' | 'playing';

/** The running game, as seen by one particular device. */
export interface ActiveGame {
  id: string;
  name: string;
  role: string | null;
  view: unknown;
  players: PlayerInfo[];
  me: PlayerInfo | null;
  over: GameResult | null;
  serverNow: number;
}

export interface LobbySnapshot {
  phase: LobbyPhase;
  devices: DeviceTile[];
  games: GameEntry[];
  selectedGameId: string | null;
  canStart: boolean;
  blockers: string[];
  game: ActiveGame | null;
  setup: GroupSetup | null;
}

export interface SyncRequest {
  deviceId?: string;
  name: string;
  avatar?: string;
  screen: { w: number; h: number };
  isTableScreen: boolean;
}

export interface SyncResponse {
  deviceId: string;
  snapshot: LobbySnapshot;
}
