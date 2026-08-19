/**
 * Client-side helpers for game views (timed rounds, countdowns). Views run on
 * many devices whose clocks may drift, so all timing is anchored to the
 * server clock carried in every snapshot (GameViewProps.serverNow).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Returns a function that estimates the current server time (ms). */
export function useServerClock(serverNow: number): () => number {
  const offsetRef = useRef(serverNow - Date.now());
  offsetRef.current = serverNow - Date.now();
  return useCallback(() => Date.now() + offsetRef.current, []);
}

/**
 * Tick down toward a server deadline. Returns remaining ms (may go negative).
 * When `active` and the deadline passes, `onExpire` fires (about once a
 * second until the game state moves on — expiry moves must be idempotent).
 */
export function useDeadline(opts: {
  active: boolean;
  endsAt: number;
  serverNow: number;
  onExpire?: () => void;
}): number {
  const now = useServerClock(opts.serverNow);
  const [remaining, setRemaining] = useState(() => opts.endsAt - now());
  const lastFired = useRef(0);
  const onExpireRef = useRef(opts.onExpire);
  onExpireRef.current = opts.onExpire;

  useEffect(() => {
    if (!opts.active) return;
    const tick = () => {
      const r = opts.endsAt - now();
      setRemaining(r);
      if (r <= 0 && Date.now() - lastFired.current > 1000) {
        lastFired.current = Date.now();
        onExpireRef.current?.();
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [opts.active, opts.endsAt, now]);

  return remaining;
}

export function formatSeconds(ms: number): string {
  return String(Math.max(0, Math.ceil(ms / 1000)));
}

/**
 * Short vibration when it becomes this player's turn (Android browsers;
 * silently a no-op elsewhere). Call from a hand view with its my-turn flag.
 */
export function useTurnBuzz(myTurn: boolean): void {
  const prev = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !prev.current) navigator.vibrate?.(60);
    prev.current = myTurn;
  }, [myTurn]);
}
