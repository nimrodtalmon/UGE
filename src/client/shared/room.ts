/**
 * Room scoping for the client shells. Pages served under /r/<code>/… talk to
 * that room's API; the classic paths (/ and /join) talk to the default room.
 * All fetches go through api() so game plugins and views stay room-unaware.
 */
const m = /^\/r\/([A-Za-z0-9]{4})(?=\/|$)/.exec(location.pathname);

export const roomCode: string | null = m ? m[1]!.toUpperCase() : null;
export const roomBase: string = m ? `/r/${m[1]}` : '';

export const api = (path: string): string => roomBase + path;
