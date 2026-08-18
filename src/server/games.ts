import fs from 'node:fs';
import path from 'node:path';
import type { Manifest } from '../shared/types.js';

/** Discover game plugins by scanning games/<id>/manifest.json. No registration code. */
export function loadManifests(gamesDir: string): Manifest[] {
  if (!fs.existsSync(gamesDir)) return [];
  const manifests: Manifest[] = [];
  for (const entry of fs.readdirSync(gamesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(gamesDir, entry.name, 'manifest.json');
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
    if (manifest.id !== entry.name) {
      console.warn(`games/${entry.name}: manifest id "${manifest.id}" != folder name, skipping`);
      continue;
    }
    manifests.push(manifest);
  }
  return manifests.sort((a, b) => a.name.localeCompare(b.name));
}
