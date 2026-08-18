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
}

export interface DeviceTile {
  id: string;
  name: string;
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
}

export interface LobbySnapshot {
  phase: LobbyPhase;
  devices: DeviceTile[];
  games: GameEntry[];
  selectedGameId: string | null;
  canStart: boolean;
  blockers: string[];
  game: ActiveGame | null;
}

export interface SyncRequest {
  deviceId?: string;
  name: string;
  screen: { w: number; h: number };
  isTableScreen: boolean;
}

export interface SyncResponse {
  deviceId: string;
  snapshot: LobbySnapshot;
}
