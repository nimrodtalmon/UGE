import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameDef } from '../shared/plugin.js';
import type { Manifest } from '../shared/types.js';

export interface GamePlugin {
  manifest: Manifest;
  /** null while a plugin ships only its manifest — selectable, not startable. */
  def: GameDef | null;
  /** role -> absolute path of its view entry (views/<role>.tsx). */
  views: Record<string, string>;
}

/** Discover game plugins by scanning games/<id>/. No registration code. */
export async function loadPlugins(gamesDir: string): Promise<GamePlugin[]> {
  if (!fs.existsSync(gamesDir)) return [];
  const plugins: GamePlugin[] = [];
  for (const entry of fs.readdirSync(gamesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(gamesDir, entry.name);
    const manifestFile = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestFile)) continue;
    let manifest: Manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest;
    } catch (err) {
      // a half-written manifest must not take the whole brain down
      console.warn(`games/${entry.name}: unreadable manifest.json — skipping (${String(err)})`);
      continue;
    }
    if (manifest.id !== entry.name) {
      console.warn(`games/${entry.name}: manifest id "${manifest.id}" != folder name, skipping`);
      continue;
    }

    let def: GameDef | null = null;
    const gameFile = path.join(dir, 'game.ts');
    if (fs.existsSync(gameFile)) {
      try {
        def = ((await import(pathToFileURL(gameFile).href)) as { default: GameDef }).default;
      } catch (err) {
        // One broken plugin used to crash the server on startup, taking every
        // other game with it. A game that will not load is simply listed as
        // not playable — the rest of the room carries on.
        console.warn(`games/${entry.name}: game.ts failed to load — listed as not playable`);
        console.warn(`  ${String(err).split('\n')[0]}`);
        def = null;
      }
    }

    const views: Record<string, string> = {};
    const roleNames = ['table', 'hand', ...manifest.roles.extras];
    for (const role of roleNames) {
      const viewFile = path.join(dir, 'views', `${role}.tsx`);
      if (fs.existsSync(viewFile)) views[role] = viewFile;
    }

    plugins.push({ manifest, def, views });
  }
  return plugins.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}
