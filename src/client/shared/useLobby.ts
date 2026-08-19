import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './room.js';
import type { LobbySnapshot, SyncResponse } from '../../shared/types.js';

const POLL_MS = 1000;

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(api(url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

/**
 * Register this browser as a device and keep a live lobby snapshot via
 * polling. Device identity survives reloads through localStorage.
 */
export function useLobby(me: { name: string; avatar?: string; isTableScreen: boolean } | null) {
  const storageKey = me?.isTableScreen ? 'uge:table-id' : 'uge:device-id';
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const deviceIdRef = useRef<string | null>(null);
  // a slow poll response must never overwrite the result of a newer request
  const lastAppliedRef = useRef(0);
  const applyRef = useRef((requestedAt: number, snap: LobbySnapshot) => {
    if (requestedAt < lastAppliedRef.current) return;
    lastAppliedRef.current = requestedAt;
    setSnapshot(snap);
  });

  useEffect(() => {
    if (!me) return;
    let stopped = false;
    const syncOnce = async () => {
      try {
        const requestedAt = Date.now();
        const res = await post<SyncResponse>('/api/lobby/sync', {
          deviceId: localStorage.getItem(storageKey) ?? undefined,
          name: me.name,
          avatar: me.avatar,
          screen: { w: window.screen.width, h: window.screen.height },
          isTableScreen: me.isTableScreen,
        });
        if (stopped) return;
        localStorage.setItem(storageKey, res.deviceId);
        deviceIdRef.current = res.deviceId;
        setDeviceId(res.deviceId);
        applyRef.current(requestedAt, res.snapshot);
        setOffline(false);
      } catch {
        if (!stopped) setOffline(true); // brain unreachable; keep polling
      }
    };
    void syncOnce();
    const timer = setInterval(syncOnce, POLL_MS);
    // phones stop polling while locked/backgrounded; resync the moment they wake
    const onVisible = () => document.visibilityState === 'visible' && void syncOnce();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [me?.name, me?.avatar, me?.isTableScreen, storageKey]);

  /**
   * POST a lobby/game mutation. deviceId is injected so every endpoint can
   * respond with a snapshot filtered for this device (hidden state stays hidden).
   */
  const act = useCallback(async (path: string, body: object = {}) => {
    try {
      const requestedAt = Date.now();
      const snap = await post<LobbySnapshot>(path, { deviceId: deviceIdRef.current, ...body });
      applyRef.current(requestedAt, snap);
    } catch {
      /* next poll recovers */
    }
  }, []);

  return { snapshot, deviceId, offline, act };
}
