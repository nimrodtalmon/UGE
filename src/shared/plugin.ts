/**
 * The game plugin contract. A game is data + pure functions: games/<id>/game.ts
 * default-exports a GameDef; games/<id>/views/<role>.tsx default-exports a React
 * component taking GameViewProps. The platform never imports a specific game.
 */

export interface PlayerInfo {
  id: string;
  name: string;
  /** Emoji the player chose (or was assigned) in the lobby. */
  avatar: string;
}

export interface SetupCtx {
  players: PlayerInfo[];
  random: () => number;
  /** Server clock (ms). Games store deadlines relative to this, never Date.now(). */
  now: number;
  /** The mode picked in the lobby (manifest `modes`); id 'default' when none declared. */
  mode: { id: string; config: Record<string, unknown> };
  /** The group declared on the table ("N players, M phones"), if any. */
  group: { players: number; phones: number } | null;
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

/** What a bot is told when it is asked to move. */
export interface BotCtx {
  /** Seat this bot plays (index into `players`). */
  seat: number;
  playerId: string;
  /** Level id from the manifest's `bots.levels`. */
  level: string;
  players: PlayerInfo[];
  random: () => number;
  now: number;
}

export interface BotMove {
  name: string;
  args?: unknown[];
}

export interface GameDef<S = unknown, V = unknown> {
  setup(ctx: SetupCtx): S;
  /** Each move returns the next state (or the same state to reject). */
  moves: Record<string, (state: S, ctx: MoveCtx, ...args: never[]) => S>;
  /** Filter what a given device may see (hidden hands, key cards). Defaults to full state. */
  playerView?(state: S, ctx: { playerId: string | null; role: string; players: PlayerInfo[] }): V;
  isOver?(state: S): GameResult | null;
  /**
   * Optional AI opponent. Called for each bot seat whenever the platform is
   * ready to let it act; return the move to play, or null when it is not this
   * seat's turn (or it has nothing to do). Must be pure and use ctx.random.
   * Declare the offered difficulties in the manifest's `bots.levels`.
   */
  bot?(state: S, ctx: BotCtx): BotMove | null;
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
