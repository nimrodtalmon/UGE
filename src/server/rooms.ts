import { Lobby } from './lobby.js';
import type { GamePlugin } from './games.js';

/**
 * A room is one independent Lobby. Locally there is a single default room and
 * nothing else; on a public server (Render) each group hosts its own room.
 * Rooms live in memory only: a scoped sync for an unknown code re-creates the
 * room, so a server restart just means everyone reconnects into a fresh lobby
 * under the same code.
 */

// unambiguous alphabet — no 0/O/1/I/L
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-Z2-9]{4}$/;

export const DEFAULT_ROOM = 'MAIN';

const IDLE_MS = 30 * 60_000;
const GC_EVERY_MS = 60_000;

interface Room {
  code: string;
  lobby: Lobby;
  lastActive: number;
}

export class Rooms {
  private rooms = new Map<string, Room>();

  constructor(private readonly plugins: GamePlugin[]) {
    this.getOrCreate(DEFAULT_ROOM);
    setInterval(() => this.gc(), GC_EVERY_MS).unref();
  }

  create(): Room {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    return this.getOrCreate(code);
  }

  /** Resolve a room by code, re-creating it if it was GC'd or lost to a restart. */
  getOrCreate(code: string): Room {
    const existing = this.rooms.get(code);
    if (existing) {
      existing.lastActive = Date.now();
      return existing;
    }
    const room: Room = { code, lobby: new Lobby(this.plugins), lastActive: Date.now() };
    this.rooms.set(code, room);
    return room;
  }

  private gc(): void {
    const cutoff = Date.now() - IDLE_MS;
    for (const [code, room] of this.rooms) {
      if (code !== DEFAULT_ROOM && room.lastActive < cutoff) this.rooms.delete(code);
    }
  }
}
