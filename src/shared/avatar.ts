/** Deterministic fun: a stable avatar emoji and color per player name/seat. */

export const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐯', '🐨', '🐵', '🦄', '🐙', '🦉', '🐬', '🦜', '🐢', '🦋', '🐝', '🦕', '🐺', '🦔', '🐷', '🐰', '🦩', '🐲', '👻', '🤖'];

/** Names matching AVATARS, so a fresh device has an identity without typing. */
const NAMES = ['Fox', 'Panda', 'Frog', 'Lion', 'Tiger', 'Koala', 'Monkey', 'Unicorn', 'Octopus', 'Owl', 'Dolphin', 'Parrot', 'Turtle', 'Butterfly', 'Bee', 'Dino', 'Wolf', 'Hedgehog', 'Pig', 'Bunny', 'Flamingo', 'Dragon', 'Ghost', 'Robot'];

/** A random ready-to-play identity for a device that has never been named. */
export function randomIdentity(): { name: string; avatar: string } {
  const i = Math.floor(Math.random() * AVATARS.length);
  return { name: NAMES[i]!, avatar: AVATARS[i]! };
}

export function avatarFor(name: string): string {
  return AVATARS[hashOf(name) % AVATARS.length]!;
}

/** Tolerates junk: these run on whatever a client sent, and a throw here used
 *  to take down every snapshot in the room. */
function hashOf(s: unknown): number {
  let h = 0;
  if (typeof s === 'string') for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

const PLAYER_COLORS = ['#e4573d', '#3d8ae4', '#3dbf6e', '#e4b83d', '#a03de4', '#e43d9c'];

export function colorFor(seat: number): string {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length]!;
}

/** Stable accent hue for any string (game id, player name) — for CSS hsl(). */
export function hueOf(s: string): number {
  return hashOf(s) % 360;
}
