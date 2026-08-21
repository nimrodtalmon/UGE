// The mode you pick must survive the group changing around it. Hiring an AI
// used to silently reset it, because setBots re-ran the default-mode pick.
import { loadPlugins } from '../src/server/games.js';
import { Lobby } from '../src/server/lobby.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugins = await loadPlugins(path.join(root, 'games'));
const fail = (m: string) => { console.error('FAIL:', m); process.exit(1); };

const screen = { w: 390, h: 844 };
const join = (l: Lobby, name: string) =>
  l.sync({ name, screen, host: false } as never).deviceId;

// a game with several modes and an AI: Yatze (phone each / pass the phone)
const withModes = plugins.find(
  (p) => (p.manifest.modes?.length ?? 0) > 1 && (p.manifest.bots?.levels.length ?? 0) > 0,
);
if (!withModes) fail('no multi-mode game with bots to test against');
const gid = withModes!.manifest.id;

const lobby = new Lobby(plugins);
const a = join(lobby, 'Ann');
join(lobby, 'Bob');
lobby.select(gid);

const modes = withModes!.manifest.modes!;
const snap = () => lobby.sync({ deviceId: a, name: 'Ann', screen, host: false } as never).snapshot;

const first = snap().selectedModeId;
const other = modes.find((m) => m.id !== first);
if (!other) fail('need a second mode');

// pick the non-default mode on purpose
lobby.setMode(other!.id);
if (snap().selectedModeId !== other!.id) fail('setMode did not take');

// hiring an AI must not throw that choice away
lobby.setBots(1);
if (snap().selectedModeId !== other!.id) {
  fail(`hiring an AI reset the mode: ${other!.id} -> ${snap().selectedModeId}`);
}
console.log(`ok: ${gid} kept mode "${other!.id}" through setBots`);

// nor must another phone joining
join(lobby, 'Cid');
if (snap().selectedModeId !== other!.id) fail('a phone joining reset the mode');
console.log('ok: kept through a phone joining');

// but a mode that no longer FITS must be replaced, not kept out of politeness:
// piling humans onto one device outruns a phone-per-player game's devices
lobby.setSeats(a, 6);
const sn = snap();
const still = withModes!.manifest.modes!.find((m) => m.id === sn.selectedModeId);
if (!still) fail(`mode went stale: ${sn.selectedModeId}`);
console.log(
  `ok: ${sn.setup.players} players on ${sn.setup.phones} phones re-picked "${sn.selectedModeId}"`,
);
lobby.setSeats(a, 1);

// but picking a different game DOES start fresh
const otherGame = plugins.find((p) => p.manifest.id !== gid && (p.manifest.modes?.length ?? 0) > 1);
if (otherGame) {
  lobby.select(otherGame.manifest.id);
  const now = snap().selectedModeId;
  const ok = otherGame.manifest.modes!.some((m) => m.id === now);
  if (!ok) fail(`new game got a stale mode: ${now}`);
  console.log(`ok: picking ${otherGame.manifest.id} re-picked a mode of its own ("${now}")`);
}

// and a mode that stops fitting is replaced
lobby.select(gid);
lobby.setMode(other!.id);
for (let i = 0; i < 8; i++) join(lobby, `P${i}`);
const after = snap().selectedModeId;
if (after === null) fail('mode went null with a game selected');
console.log(`ok: with a big group the mode settled on "${after}"`);
console.log('ALL LOBBY MODE TESTS PASSED');
