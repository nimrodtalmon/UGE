import { randomUUID } from 'node:crypto';
import { avatarFor } from '../shared/avatar.js';
import type { PlayerInfo } from '../shared/plugin.js';
import type {
  ActiveGame,
  GameEntry,
  GameMode,
  GroupSetup,
  LobbyPhase,
  LobbySnapshot,
  Manifest,
  ModeEntry,
  SyncRequest,
  SyncResponse,
} from '../shared/types.js';
import type { GamePlugin } from './games.js';
import { GameSession } from './session.js';

/**
 * Clients poll every ~1.5s. A device that misses a few polls (locked phone,
 * backgrounded tab) is shown as "away" but keeps its seat and role; only
 * after a long silence is it dropped and its role freed.
 */
const AWAY_MS = 5_000;
const REMOVE_MS = 45_000;

interface Device {
  id: string;
  name: string;
  avatar?: string;
  screen: { w: number; h: number };
  isTableScreen: boolean;
  joinedAt: number;
  lastSeen: number;
}

function deviceAvatar(d: Device): string {
  return d.isTableScreen ? '🖥️' : (d.avatar ?? avatarFor(d.name));
}

export class Lobby {
  private devices = new Map<string, Device>();
  private claims = new Map<string, string>(); // deviceId -> role
  private optOut = new Set<string>(); // devices that chose to sit out (no auto-join)
  private selectedGameId: string | null = null;
  private phase: LobbyPhase = 'lobby';
  private session: GameSession | null = null;
  private groupSetup: GroupSetup | null = null;
  private selectedModeId: string | null = null;

  constructor(private readonly games: GamePlugin[]) {}

  sync(req: SyncRequest): SyncResponse {
    const id = req.deviceId ?? randomUUID();
    const existing = this.devices.get(id);
    this.devices.set(id, {
      id,
      name: req.name,
      avatar: req.avatar,
      screen: req.screen,
      isTableScreen: req.isTableScreen,
      joinedAt: existing?.joinedAt ?? Date.now(),
      lastSeen: Date.now(),
    });
    this.tick();
    return { deviceId: id, snapshot: this.snapshotFor(id) };
  }

  setSetup(players: number, phones: number): void {
    const clamp = (v: number, lo: number, hi: number) =>
      Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : lo;
    this.groupSetup = { players: clamp(players, 1, 12), phones: clamp(phones, 0, 12) };
    this.pickDefaultMode(); // the group changed — re-pick a mode that fits it
    this.tick();
  }

  select(gameId: string | null): void {
    if (this.phase === 'lobby' && (gameId === null || this.games.some((g) => g.manifest.id === gameId))) {
      this.selectedGameId = gameId;
      this.claims.clear();
      this.optOut.clear();
      this.pickDefaultMode();
    }
    this.tick();
  }

  setMode(modeId: string): void {
    const m = this.selectedPlugin()?.manifest;
    if (this.phase === 'lobby' && m && this.modesOf(m).some((mo) => mo.id === modeId)) {
      this.selectedModeId = modeId;
    }
    this.tick();
  }

  private pickDefaultMode(): void {
    const m = this.selectedPlugin()?.manifest;
    if (!m) {
      this.selectedModeId = null;
      return;
    }
    const modes = this.modesOf(m);
    const fitting = this.groupSetup
      ? modes.find((mo) => this.modeFit(m, mo, this.groupSetup!).fits)
      : undefined;
    this.selectedModeId = (fitting ?? modes[0]!).id;
  }

  private modesOf(m: Manifest): GameMode[] {
    return m.modes && m.modes.length > 0 ? m.modes : [{ id: 'default', name: 'Standard' }];
  }

  private selectedMode(): GameMode {
    const m = this.selectedPlugin()!.manifest;
    const modes = this.modesOf(m);
    return modes.find((mo) => mo.id === this.selectedModeId) ?? modes[0]!;
  }

  private neededPhones(m: Manifest, mode: GameMode, players: number): number {
    return (
      mode.phones?.min ??
      m.phones?.min ??
      (m.roles.hand === 'per-player' ? players : 0) + m.roles.extras.length
    );
  }

  private modeFit(m: Manifest, mode: GameMode, setup: GroupSetup): { fits: boolean; reason?: string } {
    const pr = mode.players ?? m.players;
    if (setup.players < pr.min) return { fits: false, reason: `for ${pr.min}+ players` };
    if (setup.players > pr.max) {
      return { fits: false, reason: `up to ${pr.max} player${pr.max === 1 ? '' : 's'}` };
    }
    const needed = this.neededPhones(m, mode, setup.players);
    if (setup.phones < needed) {
      return {
        fits: false,
        reason:
          needed >= setup.players ? 'needs a phone per player' : `needs ${needed}+ phone${needed === 1 ? '' : 's'}`,
      };
    }
    return { fits: true };
  }

  claim(deviceId: string, role: string | null): void {
    const manifest = this.selectedPlugin()?.manifest;
    if (this.phase === 'lobby' && manifest && this.devices.has(deviceId)) {
      if (role === null) {
        this.claims.delete(deviceId);
        this.optOut.add(deviceId); // an explicit "sit out" — don't auto-join them again
      } else if (this.claimableRoles(manifest).includes(role) && this.hasCapacity(manifest, role)) {
        if (role === 'table') {
          for (const [dev, r] of this.claims) if (r === 'table') this.claims.delete(dev);
        }
        this.claims.set(deviceId, role);
        this.optOut.delete(deviceId);
      }
    }
    this.tick();
  }

  /** Start from the lobby, or restart in place once a game is over. */
  start(): void {
    this.tick();
    const plugin = this.selectedPlugin();
    const canRestart = this.phase === 'playing' && this.session?.over;
    if (!plugin?.def || !(this.phase === 'lobby' || canRestart) || !this.startState().canStart) return;
    const players: PlayerInfo[] = [...this.devices.values()]
      .filter((d) => this.claims.get(d.id) === 'hand')
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((d) => ({ id: d.id, name: d.name, avatar: deviceAvatar(d) }));
    const mode = this.selectedMode();
    this.session = new GameSession(
      plugin.def,
      players,
      { id: mode.id, config: mode.config ?? {} },
      this.groupSetup,
    );
    this.phase = 'playing';
  }

  move(deviceId: string, name: string, args: unknown[]): void {
    const role = this.claims.get(deviceId);
    if (this.phase === 'playing' && this.session && role) {
      this.session.applyMove(deviceId, role, name, args);
    }
    this.tick();
  }

  reset(): void {
    this.phase = 'lobby';
    this.session = null;
    this.tick();
  }

  snapshotFor(deviceId?: string): LobbySnapshot {
    const { canStart, blockers } = this.startState();
    return {
      phase: this.phase,
      devices: [...this.devices.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((d) => ({
          id: d.id,
          name: d.name,
          avatar: deviceAvatar(d),
          isTableScreen: d.isTableScreen,
          role: this.claims.get(d.id) ?? null,
          away: Date.now() - d.lastSeen > AWAY_MS,
        })),
      games: this.games.map((p) => this.gameEntry(p)),
      selectedGameId: this.selectedGameId,
      canStart,
      blockers,
      game: this.activeGameFor(deviceId ?? null),
      setup: this.groupSetup,
      selectedModeId: this.selectedGameId ? this.selectedModeId : null,
    };
  }

  private activeGameFor(deviceId: string | null): ActiveGame | null {
    const plugin = this.selectedPlugin();
    if (this.phase !== 'playing' || !this.session || !plugin) return null;
    const role = deviceId ? (this.claims.get(deviceId) ?? null) : null;
    return {
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      role,
      view: this.session.viewFor(deviceId, role ?? 'spectator'),
      players: this.session.players,
      me: this.session.players.find((p) => p.id === deviceId) ?? null,
      over: this.session.over,
      serverNow: Date.now(),
    };
  }

  private claimableRoles(m: Manifest): string[] {
    const roles = [...m.roles.extras];
    if (m.roles.table !== 'none') roles.push('table');
    if (m.roles.hand !== 'none') roles.push('hand');
    return roles;
  }

  private hasCapacity(m: Manifest, role: string): boolean {
    if (role !== 'hand') return true;
    const playing = [...this.claims.values()].filter((r) => r !== 'table').length;
    return playing < m.players.max;
  }

  private selectedPlugin(): GamePlugin | null {
    return this.games.find((g) => g.manifest.id === this.selectedGameId) ?? null;
  }

  /** Prune dead devices; keep the table role on the largest free screen. */
  private tick(): void {
    const cutoff = Date.now() - REMOVE_MS;
    for (const [id, d] of this.devices) {
      if (d.lastSeen < cutoff) {
        this.devices.delete(id);
        this.claims.delete(id);
        this.optOut.delete(id);
      }
    }
    const m = this.selectedPlugin()?.manifest;
    // phones auto-join as players (opting out is explicit) — in the lobby only
    if (this.phase === 'lobby' && m && m.roles.hand !== 'none') {
      const free = [...this.devices.values()]
        .filter((d) => !d.isTableScreen && !this.claims.has(d.id) && !this.optOut.has(d.id))
        .sort((a, b) => a.joinedAt - b.joinedAt);
      for (const d of free) {
        if (!this.hasCapacity(m, 'hand')) break;
        this.claims.set(d.id, 'hand');
      }
    }
    if (m && m.roles.table === 'required' && ![...this.claims.values()].includes('table')) {
      const best = [...this.devices.values()]
        .filter((d) => !this.claims.has(d.id))
        .sort(
          (a, b) =>
            Number(b.isTableScreen) - Number(a.isTableScreen) ||
            b.screen.w * b.screen.h - a.screen.w * a.screen.h,
        )[0];
      if (best) this.claims.set(best.id, 'table');
    }
  }

  /** Feasibility annotates the game list; it never blocks selecting a game. */
  private gameEntry(p: GamePlugin): GameEntry {
    const m = p.manifest;
    const bare = (mo: GameMode): ModeEntry => ({ id: mo.id, name: mo.name, tagline: mo.tagline, fits: true });
    if (!p.def) {
      return { manifest: m, feasible: false, reason: 'not playable yet', modes: this.modesOf(m).map(bare) };
    }
    // with a declared group, a game fits if ANY of its modes fits the plan
    if (this.groupSetup) {
      const modes = this.modesOf(m).map((mo) => ({
        id: mo.id,
        name: mo.name,
        tagline: mo.tagline,
        ...this.modeFit(m, mo, this.groupSetup!),
      }));
      const anyFit = modes.some((x) => x.fits);
      return {
        manifest: m,
        feasible: anyFit,
        reason: anyFit ? undefined : modes[0]?.reason,
        modes,
      };
    }
    const phones = [...this.devices.values()].filter((d) => !d.isTableScreen).length;
    if (m.roles.hand !== 'none' && phones < m.players.min) {
      return {
        manifest: m,
        feasible: false,
        reason: `needs ${m.players.min}+ phone${m.players.min === 1 ? '' : 's'} (${phones} joined)`,
        modes: this.modesOf(m).map(bare),
      };
    }
    return { manifest: m, feasible: true, modes: this.modesOf(m).map(bare) };
  }

  private startState(): { canStart: boolean; blockers: string[] } {
    const plugin = this.selectedPlugin();
    if (!plugin) return { canStart: false, blockers: ['no game selected'] };
    const blockers: string[] = [];
    if (!plugin.def) blockers.push(`${plugin.manifest.name} isn't playable yet`);
    const m = plugin.manifest;
    const roles = [...this.claims.values()];
    if (m.roles.table === 'required' && !roles.includes('table')) {
      blockers.push('no table screen assigned');
    }
    // every declared extra role must be claimed (e.g. both spymasters)
    for (const extra of m.roles.extras) {
      if (!roles.includes(extra)) blockers.push(`waiting for a ${extra.replace(/-/g, ' ')}`);
    }
    if (m.roles.hand !== 'none') {
      // gate start on minimum viable DEVICES for the chosen mode (humans can share)
      const mode = this.selectedMode();
      const needed = this.neededPhones(m, mode, (mode.players ?? m.players).min);
      const playing = roles.filter((r) => r !== 'table').length;
      if (playing < needed) {
        const missing = needed - playing;
        blockers.push(`waiting for ${missing} more phone${missing === 1 ? '' : 's'}`);
      }
    }
    return { canStart: blockers.length === 0, blockers };
  }
}
