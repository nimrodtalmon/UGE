import { useCallback, useEffect, useRef, useState } from 'react';
import type { LobbySnapshot, SyncResponse } from '../../shared/types.js';

const POLL_MS = 1000;

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
  const deviceIdRef = useRef<string | null>(null);

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
        deviceIdRef.current = res.deviceId;
        setDeviceId(res.deviceId);
        setSnapshot(res.snapshot);
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
  }, [me?.name, me?.isTableScreen, storageKey]);

  /**
   * POST a lobby/game mutation. deviceId is injected so every endpoint can
   * respond with a snapshot filtered for this device (hidden state stays hidden).
   */
  const act = useCallback(async (path: string, body: object = {}) => {
    try {
      setSnapshot(await post<LobbySnapshot>(path, { deviceId: deviceIdRef.current, ...body }));
    } catch {
      /* next poll recovers */
    }
  }, []);

  return { snapshot, deviceId, offline, act };
}
