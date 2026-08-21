// The lobby takes its input straight off the network. One sync with a missing
// name used to store a nameless device, and every snapshot after that threw in
// avatarFor — so a single malformed request bricked the room for everyone in
// it. On the public deployment that is one curl away from ending a game night.
import { loadPlugins } from '../src/server/games.js';
import { Lobby } from '../src/server/lobby.js';
import type { SyncRequest } from '../src/shared/types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugins = await loadPlugins(path.join(root, 'games'));
const fail = (m: string) => { console.error('FAIL:', m); process.exit(1); };

const GOOD: SyncRequest = { name: 'Ann', screen: { w: 390, h: 844 } };
const JUNK: unknown[] = [
  {}, null, undefined, 'string', 42, [],
  { name: null, screen: { w: 1, h: 1 } },
  { name: undefined, screen: { w: 1, h: 1 } },
  { name: {}, screen: { w: 1, h: 1 } },
  { name: [], screen: { w: 1, h: 1 } },
  { name: 42, screen: { w: 1, h: 1 } },
  { name: '', screen: { w: 1, h: 1 } },
  { name: '   ', screen: { w: 1, h: 1 } },
  { name: 'x'.repeat(5000), screen: { w: 1, h: 1 } },
  { name: 'Ann', screen: null },
  { name: 'Ann', screen: 'big' },
  { name: 'Ann', screen: { w: 'x', h: [] } },
  { name: 'Ann', screen: { w: Infinity, h: -0 } },
  { name: 'Ann', avatar: {}, screen: { w: 1, h: 1 } },
  { name: 'Ann', avatar: 'x'.repeat(900), screen: { w: 1, h: 1 } },
  { deviceId: {}, name: 'Ann', screen: { w: 1, h: 1 } },
  { deviceId: 'y'.repeat(9000), name: 'Ann', screen: { w: 1, h: 1 } },
  { __proto__: { polluted: true }, name: 'Ann', screen: { w: 1, h: 1 } },
];

let survived = 0;
for (const [i, junk] of JUNK.entries()) {
  const lobby = new Lobby(plugins);
  // a real player is already in the room when the junk arrives
  const ann = lobby.sync(GOOD).deviceId;
  try {
    lobby.sync(junk as SyncRequest);
  } catch (err) {
    fail(`payload ${i} threw: ${String(err).split('\n')[0]} — ${JSON.stringify(junk)}`);
  }
  // and the room must still work for her afterwards
  try {
    const after = lobby.sync({ ...GOOD, deviceId: ann });
    if (!after.snapshot) fail(`payload ${i} left no snapshot`);
    for (const d of after.snapshot.devices) {
      if (typeof d.name !== 'string' || d.name.length === 0) {
        fail(`payload ${i} left a nameless device`);
      }
      if (typeof d.avatar !== 'string' || d.avatar.length === 0) {
        fail(`payload ${i} left a device with no avatar`);
      }
    }
    if (after.snapshot.games.length === 0) fail(`payload ${i} lost the game list`);
  } catch (err) {
    fail(`payload ${i} bricked the room: ${String(err).split('\n')[0]}`);
  }
  survived++;
}
console.log(`ok: ${survived} malformed syncs, room still serving a real player after each`);

// a long name is kept but bounded, and a blank one gets a usable fallback
const lobby = new Lobby(plugins);
const id = lobby.sync({ name: 'z'.repeat(500), screen: { w: 1, h: 1 } }).deviceId;
const me = lobby.sync({ name: 'z'.repeat(500), screen: { w: 1, h: 1 }, deviceId: id })
  .snapshot.devices.find((d) => d.id === id)!;
if (me.name.length > 24) fail(`name not bounded: ${me.name.length} chars`);
console.log(`ok: a 500-char name is stored as ${me.name.length} chars`);

// prototype pollution must not have taken
if (({} as Record<string, unknown>).polluted !== undefined) fail('Object.prototype was polluted');
console.log('ok: Object.prototype clean');
console.log('ALL LOBBY HOSTILE TESTS PASSED');
