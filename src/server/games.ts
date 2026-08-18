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
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest;
    if (manifest.id !== entry.name) {
      console.warn(`games/${entry.name}: manifest id "${manifest.id}" != folder name, skipping`);
      continue;
    }

    let def: GameDef | null = null;
    const gameFile = path.join(dir, 'game.ts');
    if (fs.existsSync(gameFile)) {
      def = ((await import(pathToFileURL(gameFile).href)) as { default: GameDef }).default;
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
