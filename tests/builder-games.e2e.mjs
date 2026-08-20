// e2e smoke test for the builder/tycoon games — needs a freshly started brain
// on :8000. One device, no table screen.
import { launch, openHome, startGame, endGame } from './helpers.mjs';

const browser = await launch();
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const me = await openHome(browser, {
  path: '/',
  name: 'Builder',
  viewport: { width: 420, height: 920 },
  onError: (e) => fail(`pageerror: ${e.message}`),
});

// ---------- Tiny City ----------
await startGame(me, 'Tiny City');
await me.waitForSelector('.ct-grid', { timeout: 10000 });
const money0 = await me.textContent('.ct-stat-value');
// pick the road tool and lay one down
await me.click('.ct-palette button >> nth=0');
await me.click('.ct-tile:not(.ct-k-water) >> nth=0');
await me.waitForFunction(
  () => document.querySelectorAll('.ct-tile:not(.ct-k-empty):not(.ct-k-water)').length > 0,
  null, { timeout: 8000 },
);
await me.click('button:has-text("Next year")');
await me.waitForFunction(
  (before) => document.querySelector('.ct-stat-value')?.textContent !== before,
  money0, { timeout: 8000 },
);
console.log('ok: tiny city — build a tile, a year passes, the books move');
await endGame(me);

// ---------- Hotel Empire ----------
await startGame(me, 'Hotel Empire');
await me.waitForSelector('.ho-floor', { timeout: 10000 });
await me.click('.ho-slot.ho-empty >> nth=0');
await me.waitForSelector('.ho-options', { timeout: 8000 });
await me.click('.ho-option:not([disabled]) >> nth=0');
await me.waitForFunction(
  () => document.querySelectorAll('.ho-slot:not(.ho-empty)').length > 0,
  null, { timeout: 8000 },
);
await me.click('button:has-text("Play week")');
await me.waitForSelector('.ho-report:not(.empty)', { timeout: 8000 });
console.log('ok: hotel empire — build a room, play a week, report card fills in');
await endGame(me);

// ---------- Little Farm ----------
await startGame(me, 'Little Farm');
await me.waitForSelector('.fa-grid', { timeout: 10000 });
await me.click('.fa-chip:not([disabled]) >> nth=0'); // till
await me.click('.fa-grid button >> nth=0');
// tilling costs energy — the pips must drop
await me.waitForFunction(
  () => document.querySelectorAll('.fa-pips-out').length > 0,
  null, { timeout: 8000 },
);
await me.click('button:has-text("End day")');
await me.waitForFunction(
  () => (document.body.textContent ?? '').includes('Day 2') || (document.body.textContent ?? '').includes('day 2'),
  null, { timeout: 8000 },
);
console.log('ok: little farm — till a plot, end the day, the calendar turns');
await endGame(me);

await browser.close();
console.log('ALL BUILDER-GAMES TESTS PASSED');
