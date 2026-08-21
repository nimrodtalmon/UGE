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
  /**
   * Ways to play the same game — different player/phone needs and settings
   * (e.g. Alias "pass the phone" with a single shared device). Each mode may
   * override players/phones and carries an opaque config handed to setup().
   * Absent → one implicit default mode from the top-level fields.
   */
  modes?: GameMode[];
  /**
   * Offered when game.ts exports a `bot`: the platform can fill empty seats
   * with AI opponents at one of these difficulties.
   */
  bots?: { levels: BotLevel[] };
  /** Shown behind the "?" button, in the lobby and during the game. */
  help?: GameHelp;
}

export interface GameHelp {
  /** One or two sentences: what you are trying to do. */
  goal: string;
  /** How a turn works and what to tap, in order. */
  steps: string[];
  /** Scoring, variants, anything easy to miss. */
  notes?: string[];
}

export interface BotLevel {
  id: string;
  name: string;
  tagline?: string;
}

export interface GameMode {
  id: string;
  name: string;
  tagline?: string;
  players?: { min: number; max: number };
  phones?: { min: number };
  config?: Record<string, unknown>;
  /**
   * A genuine play-style choice (team vs solo, quick vs long): always offer it
   * when it fits, even when another fitting mode uses more devices.
   */
  choice?: boolean;
  /**
   * People share one device and pass it around (virtual seats). Never offered
   * when an AI fills a seat — there is nobody to hand the phone to.
   */
  shared?: boolean;
}

/** A mode as shown in the lobby, matched against the declared group. */
export interface ModeEntry {
  id: string;
  name: string;
  tagline?: string;
  fits: boolean;
  reason?: string;
  /**
   * Worth offering as a choice: fits AND makes best use of the group's
   * devices. A shared-phone fallback is not offered when everyone has a
   * phone — the table just picks; the picker shows only real choices.
   */
  offered: boolean;
}

/**
 * The group, derived live from who is connected: one device = one player
 * unless it says otherwise ("3 of us on this phone"), and any device may
 * volunteer as the shared table screen. Nothing is declared up front.
 */
export interface GroupSetup {
  players: number;
  phones: number;
  /** A screen is acting as the table (TV, laptop, spare tablet). */
  hasTable: boolean;
}

export interface DeviceTile {
  id: string;
  /** An AI opponent filling a seat, not a real device. */
  bot?: boolean;
  name: string;
  avatar: string;
  /** Volunteered as the shared table screen (shows the board, holds no seat). */
  isTable: boolean;
  /** Humans playing on this device — 1 unless it's being passed around. */
  seats: number;
  role: string | null;
  /** Stopped polling recently (locked phone, backgrounded tab) but not yet dropped. */
  away: boolean;
}

export interface GameEntry {
  manifest: Manifest;
  feasible: boolean;
  reason?: string;
  modes: ModeEntry[];
  /** Playable only because AI opponents would fill the missing seats. */
  viaBots?: number;
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
  /** Live group derived from connected devices. */
  setup: GroupSetup;
  selectedModeId: string | null;
  /** AI opponents that will fill seats when the game starts. */
  bots: number;
  botLevel: string | null;
  /** This device: its own seat count and whether it's acting as the table. */
  me: { id: string; seats: number; isTable: boolean; role: string | null } | null;
}

export interface SyncRequest {
  deviceId?: string;
  name: string;
  avatar?: string;
  screen: { w: number; h: number };
  /** Opened the host page (`/`) rather than a join link — only a UI hint. */
  host?: boolean;
}

export interface SyncResponse {
  deviceId: string;
  snapshot: LobbySnapshot;
  /** This device was removed from the room and is not in the snapshot. */
  kicked?: boolean;
}
