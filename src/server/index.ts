import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import express from 'express';
import * as esbuild from 'esbuild';
import QRCode from 'qrcode';
import { lanAddress } from './lan.js';
import { loadManifests } from './games.js';
import { Lobby } from './lobby.js';
import type { SyncRequest } from '../shared/types.js';

const PORT = 8000;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const clientDir = path.join(root, 'src', 'client');
const distDir = path.join(root, 'dist');

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

const joinUrl = `http://${lanAddress()}:${PORT}/join`;

let version = 'dev';
try {
  version = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
} catch {
  /* not a git checkout */
}

const games = loadManifests(path.join(root, 'games'));
console.log(`games discovered: ${games.map((g) => g.id).join(', ') || '(none)'}`);
const lobby = new Lobby(games);

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.sendFile(path.join(clientDir, 'table', 'index.html')));
app.get('/join', (_req, res) => res.sendFile(path.join(clientDir, 'join', 'index.html')));
app.use('/dist', express.static(distDir));
app.use('/static', express.static(clientDir));

app.post('/api/lobby/sync', (req, res) => res.json(lobby.sync(req.body as SyncRequest)));
app.post('/api/lobby/select', (req, res) => res.json(lobby.select(req.body.gameId ?? null)));
app.post('/api/lobby/claim', (req, res) =>
  res.json(lobby.claim(req.body.deviceId, req.body.role ?? null)),
);
app.post('/api/lobby/start', (_req, res) => res.json(lobby.start()));
app.post('/api/lobby/reset', (_req, res) => res.json(lobby.reset()));

app.get('/api/session', (_req, res) => {
  res.json({ joinUrl, version });
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
