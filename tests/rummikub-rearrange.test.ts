// Unit tests for the rummikub `rearrange` move — pure functions, no server needed.
// Run with: npx tsx tests/rummikub-rearrange.test.ts
import game from '../games/rummikub/game.js';
import type { RkState } from '../games/rummikub/game.js';
import type { MoveCtx } from '../src/shared/plugin.js';

const t = (name: string, cond: boolean) => {
  if (!cond) {
    console.error('FAIL:', name);
    process.exit(1);
  }
  console.log('ok:', name);
};
const id = (n: number, c: number, copy = 0) => copy * 52 + c * 13 + (n - 1);

const ctxFor = (playerId: string): MoveCtx => ({
  playerId,
  role: 'hand',
  players: [
    { id: 'a', name: 'A', avatar: '🦊' },
    { id: 'b', name: 'B', avatar: '🐼' },
  ],
  random: () => 0.5,
  now: 0,
});

// seat 0 holds red 9, blue 9, yellow 9, black 1; red 5-6-7-8 sits on the table
const baseState = (): RkState => ({
  racks: [
    [id(9, 0), id(9, 1), id(9, 2), id(1, 3)],
    [id(2, 0), id(2, 1)],
  ],
  pool: [id(13, 3)],
  melds: [[id(5, 0), id(6, 0), id(7, 0), id(8, 0)]],
  turn: 0,
  melded: [true, true],
  passes: 1,
  names: ['A', 'B'],
  winner: null,
  winText: null,
});

const rearrange = game.moves.rearrange as (s: RkState, c: MoveCtx, p: { table: number[][] }) => RkState;

{
  // extend the table run with a rack tile
  const s = baseState();
  const next = rearrange(s, ctxFor('a'), { table: [[id(5, 0), id(6, 0), id(7, 0), id(8, 0), id(9, 0)]] });
  t('extend run via rearrange accepted', next !== s && next.melds[0]!.length === 5);
  t('rack shrank by the played tile', next.racks[0]!.length === 3 && !next.racks[0]!.includes(id(9, 0)));
  t('turn passed', next.turn === 1);
  t('passes counter reset', next.passes === 0);
}
{
  // reordering the table without playing anything is not a move
  const s = baseState();
  const next = rearrange(s, ctxFor('a'), { table: [[id(8, 0), id(7, 0), id(6, 0), id(5, 0)]] });
  t('pure reshuffle (no rack tile) rejected', next === s);
}
{
  // splitting must leave every piece valid — a leftover pair is not
  const s = baseState();
  const next = rearrange(s, ctxFor('a'), {
    table: [
      [id(5, 0), id(6, 0), id(7, 0)],
      [id(8, 0), id(9, 0)],
    ],
  });
  t('split leaving an invalid pair rejected', next === s);
}
{
  // true manipulation: steal a run's end tile into a new group built with rack tiles
  const s = baseState();
  s.melds = [[id(9, 3), id(10, 3), id(11, 3), id(12, 3)]]; // black 9-12
  const next = rearrange(s, ctxFor('a'), {
    table: [
      [id(10, 3), id(11, 3), id(12, 3)],
      [id(9, 3), id(9, 0), id(9, 1)],
    ],
  });
  t('stealing a run end into a new group accepted', next !== s && next.melds.length === 2);
  t('two rack tiles consumed', next.racks[0]!.length === 2);
}
{
  // a tile already on the table can never leave it
  const s = baseState();
  const next = rearrange(s, ctxFor('a'), {
    table: [[id(5, 0), id(6, 0), id(7, 0), id(9, 0)]], // the 8 vanished
  });
  t('table tile removed from table rejected', next === s);
}
{
  // tiles you don't hold can't be played
  const s = baseState();
  const next = rearrange(s, ctxFor('a'), {
    table: [[id(5, 0), id(6, 0), id(7, 0), id(8, 0), id(9, 0, 1)]], // second-copy red 9, not in the rack
  });
  t('tile not in rack rejected', next === s);
}
{
  const s = baseState();
  const table = [[id(5, 0), id(6, 0), id(7, 0), id(8, 0), id(9, 0)]];
  t('not your turn rejected', rearrange(s, ctxFor('b'), { table }) === s);
  const closed: RkState = { ...baseState(), melded: [false, true] };
  t('before opening rejected', rearrange(closed, ctxFor('a'), { table }) === closed);
}
{
  // one physical tile can't appear in two melds
  const s = baseState();
  const next = rearrange(s, ctxFor('a'), {
    table: [
      [id(5, 0), id(6, 0), id(7, 0), id(8, 0)],
      [id(8, 0), id(9, 0), id(7, 0)],
    ],
  });
  t('duplicated tile across melds rejected', next === s);
}
{
  // playing your last tile via rearrange wins
  const s = baseState();
  s.racks[0] = [id(9, 0)];
  const next = rearrange(s, ctxFor('a'), { table: [[id(5, 0), id(6, 0), id(7, 0), id(8, 0), id(9, 0)]] });
  t('emptying the rack wins', next.winner === 0 && (next.winText ?? '').includes('Rummikub'));
}
console.log('ALL RUMMIKUB REARRANGE TESTS PASSED');
