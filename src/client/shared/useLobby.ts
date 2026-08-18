import { useCallback, useEffect, useState } from 'react';
import type { LobbySnapshot, SyncResponse } from '../../shared/types.js';

const POLL_MS = 1500;

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
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
export function useLobby(me: { name: string; isTableScreen: boolean } | null) {
  const storageKey = me?.isTableScreen ? 'uge:table-id' : 'uge:device-id';
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!me) return;
    let stopped = false;
    const syncOnce = async () => {
      try {
        const res = await post<SyncResponse>('/api/lobby/sync', {
          deviceId: localStorage.getItem(storageKey) ?? undefined,
          name: me.name,
          screen: { w: window.screen.width, h: window.screen.height },
          isTableScreen: me.isTableScreen,
        });
        if (stopped) return;
        localStorage.setItem(storageKey, res.deviceId);
        setDeviceId(res.deviceId);
        setSnapshot(res.snapshot);
        setOffline(false);
      } catch {
        if (!stopped) setOffline(true); // brain unreachable; keep polling
      }
    };
    void syncOnce();
    const timer = setInterval(syncOnce, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [me?.name, me?.isTableScreen, storageKey]);

  /** POST a lobby mutation; every mutation endpoint returns a fresh snapshot. */
  const act = useCallback(async (path: string, body: object = {}) => {
    try {
      setSnapshot(await post<LobbySnapshot>(path, body));
    } catch {
      /* next poll recovers */
    }
  }, []);

  return { snapshot, deviceId, offline, act };
}
