/**
 * The game plugin contract. A game is data + pure functions: games/<id>/game.ts
 * default-exports a GameDef; games/<id>/views/<role>.tsx default-exports a React
 * component taking GameViewProps. The platform never imports a specific game.
 */

export interface PlayerInfo {
  id: string;
  name: string;
}

export interface SetupCtx {
  players: PlayerInfo[];
  random: () => number;
  /** Server clock (ms). Games store deadlines relative to this, never Date.now(). */
  now: number;
}

export interface MoveCtx {
  /** Device that sent the move — a player's id, or the table's device id. */
  playerId: string;
  role: string;
  players: PlayerInfo[];
  random: () => number;
  /** Server clock (ms). Games store deadlines relative to this, never Date.now(). */
  now: number;
}

export interface GameResult {
  text: string;
}

export interface GameDef<S = unknown, V = unknown> {
  setup(ctx: SetupCtx): S;
  /** Each move returns the next state (or the same state to reject). */
  moves: Record<string, (state: S, ctx: MoveCtx, ...args: never[]) => S>;
  /** Filter what a given device may see (hidden hands, key cards). Defaults to full state. */
  playerView?(state: S, ctx: { playerId: string | null; role: string; players: PlayerInfo[] }): V;
  isOver?(state: S): GameResult | null;
}

/** Props every role view receives from the platform shell. */
export interface GameViewProps<V = unknown> {
  view: V;
  role: string;
  me: PlayerInfo | null;
  players: PlayerInfo[];
  over: GameResult | null;
  move: (name: string, ...args: unknown[]) => void;
  /** Server clock (ms) at snapshot time — see gameKit's useServerClock. */
  serverNow: number;
}
