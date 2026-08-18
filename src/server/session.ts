import type { GameDef, GameResult, PlayerInfo } from '../shared/plugin.js';

/** One running game: holds state, applies moves, filters per-device views. */
export class GameSession {
  private state: unknown;
  over: GameResult | null = null;

  constructor(
    private readonly def: GameDef,
    readonly players: PlayerInfo[],
  ) {
    this.state = def.setup({ players, random: Math.random, now: Date.now() });
    this.over = def.isOver?.(this.state) ?? null;
  }

  applyMove(playerId: string, role: string, name: string, args: unknown[]): void {
    if (this.over) return;
    const move = this.def.moves[name];
    if (!move) return;
    this.state = move(
      this.state,
      { playerId, role, players: this.players, random: Math.random, now: Date.now() },
      ...(args as never[]),
    );
    this.over = this.def.isOver?.(this.state) ?? null;
  }

  viewFor(playerId: string | null, role: string): unknown {
    return this.def.playerView
      ? this.def.playerView(this.state, { playerId, role, players: this.players })
      : this.state;
  }
}
