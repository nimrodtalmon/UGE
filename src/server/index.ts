import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import express from 'express';
import * as esbuild from 'esbuild';
import QRCode from 'qrcode';
import { lanAddress } from './lan.js';
import { loadPlugins } from './games.js';
import { CODE_RE, DEFAULT_ROOM, Rooms } from './rooms.js';
import type { SyncRequest } from '../shared/types.js';

const PORT = Number(process.env.PORT) || 8000;

// public mode: a hosted deployment (Render sets RENDER_EXTERNAL_URL) — the
// landing page offers rooms, join URLs use the public address, and in-place
// git updates are disabled (deploys come from git push instead).
const publicMode = Boolean(process.env.RENDER_EXTERNAL_URL) || process.env.UGE_PUBLIC === '1';
const publicBase =
  process.env.RENDER_EXTERNAL_URL ?? process.env.UGE_PUBLIC_URL ?? `http://${lanAddress()}:${PORT}`;

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

let version = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev';
try {
  version = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
} catch {
  /* not a git checkout (e.g. a Render build) — RENDER_GIT_COMMIT covers it */
}

const rooms = new Rooms(plugins);

/** The public join URL for a room — the default room keeps the classic /join. */
function joinUrlFor(code: string): string {
  return code === DEFAULT_ROOM ? `${publicBase}/join` : `${publicBase}/r/${code}/join`;
}

const app = express();
app.use(express.json());

// ---- room-scoped API (also serves the classic unscoped paths via the default room)
const api = express.Router({ mergeParams: true });
api.use((req, res, next) => {
  const raw = (req.params as { code?: string }).code;
  if (raw === undefined) {
    res.locals.room = rooms.getOrCreate(DEFAULT_ROOM);
    return next();
  }
  const code = raw.toUpperCase();
  if (!CODE_RE.test(code)) return res.status(404).json({ error: 'no such room' });
  // unknown codes are re-created on the fly, so a server restart (or a GC'd
  // room) never strands polling devices — they reconnect into a fresh lobby
  res.locals.room = rooms.getOrCreate(code);
  next();
});
const lobbyOf = (res: express.Response) => res.locals.room.lobby as import('./lobby.js').Lobby;
const codeOf = (res: express.Response) => res.locals.room.code as string;

api.post('/lobby/sync', (req, res) => res.json(lobbyOf(res).sync(req.body as SyncRequest)));
api.post('/lobby/seats', (req, res) => {
  lobbyOf(res).setSeats(req.body.deviceId, req.body.seats);
  res.json(lobbyOf(res).snapshotFor(req.body.deviceId));
});
api.post('/lobby/table', (req, res) => {
  lobbyOf(res).setTable(req.body.deviceId, req.body.on === true);
  res.json(lobbyOf(res).snapshotFor(req.body.deviceId));
});
api.post('/lobby/mode', (req, res) => {
  lobbyOf(res).setMode(req.body.modeId);
  res.json(lobbyOf(res).snapshotFor(req.body.deviceId));
});
api.post('/lobby/select', (req, res) => {
  lobbyOf(res).select(req.body.gameId ?? null);
  res.json(lobbyOf(res).snapshotFor(req.body.deviceId));
});
api.post('/lobby/claim', (req, res) => {
  lobbyOf(res).claim(req.body.deviceId, req.body.role ?? null);
  res.json(lobbyOf(res).snapshotFor(req.body.deviceId));
});
api.post('/lobby/start', (req, res) => {
  lobbyOf(res).start();
  res.json(lobbyOf(res).snapshotFor(req.body.deviceId));
});
api.post('/lobby/reset', (req, res) => {
  lobbyOf(res).reset();
  res.json(lobbyOf(res).snapshotFor(req.body.deviceId));
});
api.post('/game/move', (req, res) => {
  lobbyOf(res).move(req.body.deviceId, req.body.name, req.body.args ?? []);
  res.json(lobbyOf(res).snapshotFor(req.body.deviceId));
});

api.get('/session', (_req, res) => {
  const code = codeOf(res);
  res.json({
    joinUrl: joinUrlFor(code),
    version,
    wifi: config.wifi ? { ssid: config.wifi.ssid } : null,
    updatable: !publicMode,
    roomCode: publicMode && code !== DEFAULT_ROOM ? code : null,
  });
});

api.get('/qr.svg', async (_req, res) => {
  const svg = await QRCode.toString(joinUrlFor(codeOf(res)), { type: 'svg', margin: 1 });
  res.type('image/svg+xml').send(svg);
});

api.get('/wifi-qr.svg', async (_req, res) => {
  if (!config.wifi) {
    res.status(404).end();
    return;
  }
  const svg = await QRCode.toString(wifiQrText(config.wifi), { type: 'svg', margin: 1 });
  res.type('image/svg+xml').send(svg);
});

// The table screen's Update button: exit with code 42 so the start.sh
// supervisor pulls the latest code and relaunches. On a hosted deployment
// updates arrive via git push (auto-deploy), so this is a no-op there.
api.post('/admin/update', (_req, res) => {
  if (publicMode) {
    res.json({ ok: false, reason: 'updates are deployed via git push' });
    return;
  }
  res.json({ ok: true });
  console.log('update requested — restarting via supervisor');
  setTimeout(() => process.exit(42), 200);
});

app.use('/r/:code/api', api);
app.use('/api', api);

// room creation (used by the public landing page)
app.post('/api/rooms', (_req, res) => {
  const room = rooms.create();
  res.json({ code: room.code });
});

// ---- pages
const tableHtml = path.join(clientDir, 'table', 'index.html');
const joinHtml = path.join(clientDir, 'join', 'index.html');
const landingHtml = path.join(clientDir, 'landing', 'index.html');

app.get('/', (_req, res) => res.sendFile(publicMode ? landingHtml : tableHtml));
app.get('/join', (_req, res) => (publicMode ? res.redirect('/') : res.sendFile(joinHtml)));
app.get('/r/:code', (req, res) =>
  CODE_RE.test(req.params.code.toUpperCase()) ? res.sendFile(tableHtml) : res.redirect('/'),
);
app.get('/r/:code/join', (req, res) =>
  CODE_RE.test(req.params.code.toUpperCase()) ? res.sendFile(joinHtml) : res.redirect('/'),
);
app.use('/dist', express.static(distDir));
app.use('/static', express.static(clientDir));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`UGE brain running${publicMode ? ' (public mode)' : ''}.`);
  console.log(`  table: http://localhost:${PORT}`);
  console.log(`  join:  ${joinUrlFor(DEFAULT_ROOM)}`);
  if (!publicMode) openBrowser(`http://localhost:${PORT}`);
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
