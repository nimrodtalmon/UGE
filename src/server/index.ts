import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import express from 'express';
import * as esbuild from 'esbuild';
import QRCode from 'qrcode';
import { lanAddress } from './lan.js';

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

const app = express();

app.get('/', (_req, res) => res.sendFile(path.join(clientDir, 'table', 'index.html')));
app.get('/join', (_req, res) => res.sendFile(path.join(clientDir, 'join', 'index.html')));
app.use('/dist', express.static(distDir));

app.get('/api/session', (_req, res) => {
  res.json({ joinUrl });
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
