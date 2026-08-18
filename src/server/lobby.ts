import { randomUUID } from 'node:crypto';
import { avatarFor } from '../shared/avatar.js';
import type { PlayerInfo } from '../shared/plugin.js';
import type {
  ActiveGame,
  GameEntry,
  LobbyPhase,
  LobbySnapshot,
  Manifest,
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

  select(gameId: string | null): void {
    if (this.phase === 'lobby' && (gameId === null || this.games.some((g) => g.manifest.id === gameId))) {
      this.selectedGameId = gameId;
      this.claims.clear();
      this.optOut.clear();
    }
    this.tick();
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
    this.session = new GameSession(plugin.def, players);
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
    const hands = [...this.claims.values()].filter((r) => r === 'hand').length;
    return hands < m.players.max;
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
    const phones = [...this.devices.values()].filter((d) => !d.isTableScreen).length;
    if (!p.def) return { manifest: m, feasible: false, reason: 'not playable yet' };
    if (m.roles.hand !== 'none' && phones < m.players.min) {
      return {
        manifest: m,
        feasible: false,
        reason: `needs ${m.players.min}+ phone${m.players.min === 1 ? '' : 's'} (${phones} joined)`,
      };
    }
    return { manifest: m, feasible: true };
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
    if (m.roles.hand !== 'none') {
      const hands = roles.filter((r) => r === 'hand').length;
      if (hands < m.players.min) {
        const missing = m.players.min - hands;
        blockers.push(`waiting for ${missing} more player${missing === 1 ? '' : 's'}`);
      }
    }
    return { canStart: blockers.length === 0, blockers };
  }
}
