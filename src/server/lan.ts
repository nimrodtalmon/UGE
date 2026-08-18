import os from 'node:os';

/**
 * Best-guess LAN IPv4 of this machine. Phones on the same WiFi must be able
 * to reach this address; private ranges are preferred over anything else
 * (a VPN or virtual interface may expose a public-looking address first).
 */
export function lanAddress(): string {
  const candidates: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address);
    }
  }
  const priv = candidates.find(
    (a) =>
      a.startsWith('192.168.') || a.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a),
  );
  return priv ?? candidates[0] ?? 'localhost';
}
