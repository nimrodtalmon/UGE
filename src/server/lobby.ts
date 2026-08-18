import { randomUUID } from 'node:crypto';
import type {
  GameEntry,
  LobbyPhase,
  LobbySnapshot,
  Manifest,
  SyncRequest,
  SyncResponse,
} from '../shared/types.js';

/** Clients poll every ~1.5s; a device silent this long has left. */
const DEVICE_TTL_MS = 10_000;

interface Device {
  id: string;
  name: string;
  screen: { w: number; h: number };
  isTableScreen: boolean;
  joinedAt: number;
  lastSeen: number;
}

export class Lobby {
  private devices = new Map<string, Device>();
  private claims = new Map<string, string>(); // deviceId -> role
  private selectedGameId: string | null = null;
  private phase: LobbyPhase = 'lobby';

  constructor(private readonly games: Manifest[]) {}

  sync(req: SyncRequest): SyncResponse {
    const id = req.deviceId ?? randomUUID();
    const existing = this.devices.get(id);
    this.devices.set(id, {
      id,
      name: req.name,
      screen: req.screen,
      isTableScreen: req.isTableScreen,
      joinedAt: existing?.joinedAt ?? Date.now(),
      lastSeen: Date.now(),
    });
    this.tick();
    return { deviceId: id, snapshot: this.snapshot() };
  }

  select(gameId: string | null): LobbySnapshot {
    if (this.phase === 'lobby' && (gameId === null || this.games.some((g) => g.id === gameId))) {
      this.selectedGameId = gameId;
      this.claims.clear();
    }
    this.tick();
    return this.snapshot();
  }

  claim(deviceId: string, role: string | null): LobbySnapshot {
    const manifest = this.selectedManifest();
    if (this.phase === 'lobby' && manifest && this.devices.has(deviceId)) {
      if (role === null) {
        this.claims.delete(deviceId);
      } else if (this.claimableRoles(manifest).includes(role) && this.hasCapacity(manifest, role)) {
        if (role === 'table') {
          for (const [dev, r] of this.claims) if (r === 'table') this.claims.delete(dev);
        }
        this.claims.set(deviceId, role);
      }
    }
    this.tick();
    return this.snapshot();
  }

  start(): LobbySnapshot {
    this.tick();
    if (this.phase === 'lobby' && this.startState().canStart) this.phase = 'starting';
    return this.snapshot();
  }

  reset(): LobbySnapshot {
    this.phase = 'lobby';
    this.tick();
    return this.snapshot();
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

  private selectedManifest(): Manifest | null {
    return this.games.find((g) => g.id === this.selectedGameId) ?? null;
  }

  /** Prune dead devices; keep the table role on the largest free screen. */
  private tick(): void {
    const cutoff = Date.now() - DEVICE_TTL_MS;
    for (const [id, d] of this.devices) {
      if (d.lastSeen < cutoff) {
        this.devices.delete(id);
        this.claims.delete(id);
      }
    }
    const m = this.selectedManifest();
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

  private gameEntry(m: Manifest): GameEntry {
    const phones = [...this.devices.values()].filter((d) => !d.isTableScreen).length;
    const screens = this.devices.size - phones;
    if (m.roles.hand !== 'none' && phones < m.players.min) {
      return {
        manifest: m,
        feasible: false,
        reason: `needs ${m.players.min}+ phones (${phones} joined)`,
      };
    }
    if (m.roles.table === 'required' && screens === 0 && phones <= m.players.min) {
      return { manifest: m, feasible: false, reason: 'needs a table screen' };
    }
    return { manifest: m, feasible: true };
  }

  private startState(): { canStart: boolean; blockers: string[] } {
    const m = this.selectedManifest();
    if (!m) return { canStart: false, blockers: ['no game selected'] };
    const blockers: string[] = [];
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

  private snapshot(): LobbySnapshot {
    const { canStart, blockers } = this.startState();
    return {
      phase: this.phase,
      devices: [...this.devices.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((d) => ({
          id: d.id,
          name: d.name,
          isTableScreen: d.isTableScreen,
          role: this.claims.get(d.id) ?? null,
        })),
      games: this.games.map((m) => this.gameEntry(m)),
      selectedGameId: this.selectedGameId,
      canStart,
      blockers,
    };
  }
}
