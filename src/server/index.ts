import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import express from 'express';
import * as esbuild from 'esbuild';
import QRCode from 'qrcode';
import { lanAddress } from './lan.js';
import { loadPlugins } from './games.js';
import { Lobby } from './lobby.js';
import type { SyncRequest } from '../shared/types.js';

const PORT = 8000;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const clientDir = path.join(root, 'src', 'client');
const distDir = path.join(root, 'dist');

const plugins = await loadPlugins(path.join(root, 'games'));
console.log(`games discovered: ${plugins.map((p) => p.manifest.id).join(', ') || '(none)'}`);

// platform shell bundles (own their React copy, exposed on globalThis)
await esbuild.build({
  entryPoints: {
    table: path.join(clientDir, 'table', 'main.tsx'),
    join: path.join(clientDir, 'join', 'main.tsx'),
  },
  bundle: true,
  outdir: distDir,
  format: 'esm',
  jsx: 'automatic',
  sourcemap: true,
});

// game view bundles — react aliased to shims so views share the shell's React
const viewEntries: Record<string, string> = {};
for (const p of plugins) {
  for (const [role, file] of Object.entries(p.views)) {
    viewEntries[`games/${p.manifest.id}/${role}`] = file;
  }
}
if (Object.keys(viewEntries).length > 0) {
  await esbuild.build({
    entryPoints: viewEntries,
    bundle: true,
    outdir: distDir,
    format: 'esm',
    jsx: 'automatic',
    sourcemap: true,
    alias: {
      react: path.join(clientDir, 'shared', 'react-shim.ts'),
      'react/jsx-runtime': path.join(clientDir, 'shared', 'jsx-runtime-shim.ts'),
    },
  });
}

const joinUrl = `http://${lanAddress()}:${PORT}/join`;

// optional local config (gitignored — may hold a WiFi password).
// wifi: { ssid, password?, security? } → the table shows a join-this-WiFi QR
// next to the join-the-game QR, for road mode (hotspot / Internet Sharing).
interface UgeConfig {
  wifi?: { ssid: string; password?: string; security?: 'WPA' | 'WEP' | 'nopass' };
}
let config: UgeConfig = {};
const configPath = path.join(root, 'uge.config.json');
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as UgeConfig;
  if (config.wifi) console.log(`wifi QR enabled for network "${config.wifi.ssid}"`);
}

function wifiQrText(w: NonNullable<UgeConfig['wifi']>): string {
  const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
  const security = w.security ?? (w.password ? 'WPA' : 'nopass');
  const pass = security === 'nopass' || !w.password ? '' : `P:${esc(w.password)};`;
  return `WIFI:T:${security};S:${esc(w.ssid)};${pass};`;
}

let version = 'dev';
try {
  version = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
} catch {
  /* not a git checkout */
}

const lobby = new Lobby(plugins);

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.sendFile(path.join(clientDir, 'table', 'index.html')));
app.get('/join', (_req, res) => res.sendFile(path.join(clientDir, 'join', 'index.html')));
app.use('/dist', express.static(distDir));
app.use('/static', express.static(clientDir));

app.post('/api/lobby/sync', (req, res) => res.json(lobby.sync(req.body as SyncRequest)));
app.post('/api/lobby/setup', (req, res) => {
  lobby.setSetup(req.body.players, req.body.phones);
  res.json(lobby.snapshotFor(req.body.deviceId));
});
app.post('/api/lobby/mode', (req, res) => {
  lobby.setMode(req.body.modeId);
  res.json(lobby.snapshotFor(req.body.deviceId));
});
app.post('/api/lobby/select', (req, res) => {
  lobby.select(req.body.gameId ?? null);
  res.json(lobby.snapshotFor(req.body.deviceId));
});
app.post('/api/lobby/claim', (req, res) => {
  lobby.claim(req.body.deviceId, req.body.role ?? null);
  res.json(lobby.snapshotFor(req.body.deviceId));
});
app.post('/api/lobby/start', (req, res) => {
  lobby.start();
  res.json(lobby.snapshotFor(req.body.deviceId));
});
app.post('/api/lobby/reset', (req, res) => {
  lobby.reset();
  res.json(lobby.snapshotFor(req.body.deviceId));
});
app.post('/api/game/move', (req, res) => {
  lobby.move(req.body.deviceId, req.body.name, req.body.args ?? []);
  res.json(lobby.snapshotFor(req.body.deviceId));
});

app.get('/api/session', (_req, res) => {
  res.json({ joinUrl, version, wifi: config.wifi ? { ssid: config.wifi.ssid } : null });
});

app.get('/api/wifi-qr.svg', async (_req, res) => {
  if (!config.wifi) {
    res.status(404).end();
    return;
  }
  const svg = await QRCode.toString(wifiQrText(config.wifi), { type: 'svg', margin: 1 });
  res.type('image/svg+xml').send(svg);
});

// The table screen's Update button: exit with code 42 so the start.sh
// supervisor pulls the latest code and relaunches.
app.post('/api/admin/update', (_req, res) => {
  res.json({ ok: true });
  console.log('update requested — restarting via supervisor');
  setTimeout(() => process.exit(42), 200);
});

app.get('/api/qr.svg', async (_req, res) => {
  const svg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1 });
  res.type('image/svg+xml').send(svg);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`UGE brain running.`);
  console.log(`  table: http://localhost:${PORT}`);
  console.log(`  join:  ${joinUrl}`);
  openBrowser(`http://localhost:${PORT}`);
});

/** Best-effort: pop the table view on the brain's own screen. */
function openBrowser(url: string): void {
  if (process.env.UGE_NO_OPEN) return;
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  spawn(cmd, args as string[], { stdio: 'ignore', detached: true }).on('error', () => {});
}
