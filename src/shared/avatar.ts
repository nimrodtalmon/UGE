/** Deterministic fun: a stable avatar emoji and color per player name/seat. */

export const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐯', '🐨', '🐵', '🦄', '🐙', '🦉', '🐬', '🦜', '🐢', '🦋', '🐝', '🦕', '🐺', '🦔', '🐷', '🐰', '🦩', '🐲', '👻', '🤖'];

export function avatarFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATARS[h % AVATARS.length]!;
}

const PLAYER_COLORS = ['#e4573d', '#3d8ae4', '#3dbf6e', '#e4b83d', '#a03de4', '#e43d9c'];

export function colorFor(seat: number): string {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length]!;
}

/** Stable accent hue for any string (game id, player name) — for CSS hsl(). */
export function hueOf(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h % 360;
}
