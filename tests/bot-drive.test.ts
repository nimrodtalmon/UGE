// Drives every game that ships a bot with an all-AI table, using the real
// GameDef, and asserts the bots actually play: no stalls, no rejected moves
// on repeat, and the game reaches an end (or makes real progress).
// Run with: npx tsx tests/bot-drive.test.ts
import fs from 'node:fs';
import path from 'node:path';
import type { GameDef, MoveCtx, PlayerInfo } from '../src/shared/plugin.js';
import type { Manifest } from '../src/shared/types.js';

const root = path.resolve(import.meta.dirname, '..');
const gamesDir = path.join(root, 'games');
const fail = (msg: string) => {
  console.error('FAIL:', msg);
  process.exit(1);
};

/** The platform's own timer moves are client-driven; emulate them here. */
const TIMER_ROLE = 'table';
/**
 * Views fire a specific expiry move; a generic driver must not pick whichever
 * one happens to be first in the object (firing "next" before "timeUp" would
 * skip a trivia question without scoring it). Prefer the expiry names.
 */
const TIMER_ORDER = [
  'timeUp', 'closeRound', 'scoreRound', 'endRound', 'resolve', 'clearTrick',
  'startVote', 'nextRound', 'nextHand', 'next', 'nextYear', 'nextWeek', 'endDay',
];
const MAX_STEPS = Number(process.env.STEPS ?? 260);
const ONLY = process.env.ONLY;

for (const id of fs.readdirSync(gamesDir).sort()) {
  const manifestPath = path.join(gamesDir, id, 'manifest.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
  const levels = manifest.bots?.levels;
  if (!levels || levels.length === 0) continue;
  if (ONLY && ONLY !== id) continue;
  console.log(`-- ${id}`);

  const mod = (await import(path.join(gamesDir, id, 'game.ts'))) as { default: GameDef };
  const def = mod.default;
  if (!def.bot) fail(`${id}: manifest declares bots but game.ts exports no bot()`);

  for (const level of levels) {
    const seats = Math.max(manifest.players.min, 2);
    const players: PlayerInfo[] = Array.from({ length: seats }, (_, i) => ({
      id: `bot:${i + 1}`,
      name: `Bot${i + 1}`,
      avatar: '🤖',
    }));
    let now = 1_000_000;
    const random = () => Math.random();
    let state = def.setup({
      players,
      random,
      now,
      mode: { id: manifest.modes?.[0]?.id ?? 'default', config: manifest.modes?.[0]?.config ?? {} },
      group: { players: seats, phones: seats },
    });

    const ctxFor = (playerId: string, role: string): MoveCtx => ({ playerId, role, players, random, now });
    let steps = 0;
    let changes = 0;
    let stalls = 0;
    let over = def.isOver?.(state) ?? null;

    while (!over && steps < MAX_STEPS) {
      steps++;
      now += 900; // the platform calls bots about once a second
      let acted = false;
      for (const p of players) {
        const seat = players.indexOf(p);
        const mv = def.bot!(state, { seat, playerId: p.id, level: level.id, players, random, now });
        if (!mv) continue;
        const move = def.moves[mv.name];
        if (!move) fail(`${id}/${level.id}: bot returned unknown move "${mv.name}"`);
        const next = move(state, ctxFor(p.id, 'hand'), ...((mv.args ?? []) as never[]));
        if (next !== state) {
          state = next;
          changes++;
          acted = true;
          stalls = 0;
          break;
        }
      }
      if (!acted) {
        // Nobody moved. A real client fires its expiry move only once the
        // deadline passes, so wait the clock out rather than skipping ahead —
        // bots with a human-like think delay need those beats.
        stalls++;
        const deadline = (state as { endsAt?: unknown }).endsAt;
        if (typeof deadline === 'number' && deadline > now) continue; // still ticking
        if (stalls < 24) continue; // no deadline: some bots pace themselves for seconds
        const names = Object.keys(def.moves);
        names.sort((a, b) => {
          const ia = TIMER_ORDER.indexOf(a);
          const ib = TIMER_ORDER.indexOf(b);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        for (const name of names) {
          const next = def.moves[name]!(state, ctxFor('table-device', TIMER_ROLE), ...([] as never[]));
          if (next !== state) {
            state = next;
            changes++;
            acted = true;
            break;
          }
        }
      }
      if (!acted) break; // genuinely stuck
      over = def.isOver?.(state) ?? null;
    }

    // The real assertion is that the bots keep playing: a stalled bot (null
    // forever, or a move the rules keep rejecting) shows up here. A game that
    // ENDED is fine at any length — UNO can be over in a dozen moves.
    if (!over && changes < 20) {
      fail(`${id}/${level.id}: bots stalled after ${changes} moves (${steps} steps)`);
    }
    if (changes < 3) fail(`${id}/${level.id}: bots never really played (${changes} moves)`);
    console.log(
      `ok: ${id.padEnd(12)} ${level.id.padEnd(7)} ${changes} moves${over ? ` → ${over.text.slice(0, 48)}` : ' (progressed, no end state)'}`,
    );
  }
}
console.log('ALL BOT-DRIVE TESTS PASSED');
