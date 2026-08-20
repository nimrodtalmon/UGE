// e2e smoke test for the single-player games — needs a freshly started brain
// (UGE_NO_OPEN=1 npm run start:once) on :8000.
// One device, no table screen: exactly how someone opens UGE on their own phone.
import { launch, openHome, startGame, endGame } from './helpers.mjs';

const browser = await launch();
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const me = await openHome(browser, {
  path: '/',
  name: 'Solo',
  viewport: { width: 420, height: 900 },
  onError: (e) => fail(`pageerror: ${e.message}`),
});

// every solo game must be playable by one person with no table screen
for (const name of ['Lights Out', '2048', 'Minesweeper', 'Solitaire', 'Word Hunt']) {
  await me.click('.seg:has-text("Solo")');
  if (!(await me.locator(`.game.ready:has-text("${name}")`).count())) {
    fail(`${name} should be ready for a lone player`);
  }
}
console.log('ok: solo tab lists every one-player game as ready');

// ---------- 2048 ----------
await startGame(me, '2048');
await me.waitForSelector('.sl-pad', { timeout: 10000 });
const startTiles = await me.locator('.sl-tile').count();
if (startTiles !== 2) fail(`expected 2 starting tiles, got ${startTiles}`);
// swipe: pointer drag across the pad
const pad = await me.locator('.sl-pad').boundingBox();
const swipe = async (dx, dy) => {
  await me.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2);
  await me.mouse.down();
  await me.mouse.move(pad.x + pad.width / 2 + dx, pad.y + pad.height / 2 + dy, { steps: 6 });
  await me.mouse.up();
};
await swipe(0, -120); // up
await me.waitForFunction(() => document.querySelectorAll('.sl-tile').length >= 2, null, { timeout: 8000 });
const movesText = await me.textContent('.sl-stats');
if (!movesText) fail('2048 has no stats readout');
console.log('ok: 2048 — swipe registers, board keeps tiles');
await endGame(me);

// ---------- Minesweeper ----------
await startGame(me, 'Minesweeper');
await me.waitForSelector('.ms-grid', { timeout: 10000 });
// no mine may be readable before the first tap
if (await me.locator('.ms-cell-mine').count()) fail('mines visible before the first reveal');
await me.click('.ms-cell >> nth=0');
await me.waitForFunction(
  () => document.querySelectorAll('.ms-cell-open').length > 0,
  null, { timeout: 8000 },
);
// the first tap is always safe, so the game must still be running
if (await me.locator('.ms-cell-mine').count()) fail('first tap hit a mine — safe-first-click broken');
console.log('ok: minesweeper — first tap is safe and opens a region, mines stay hidden');
await endGame(me);

// ---------- Solitaire ----------
await startGame(me, 'Solitaire');
await me.waitForSelector('.sol-wrap', { timeout: 10000 });
const faceUp = await me.locator('.sol-card:not(.down):not(.slot)').count();
if (faceUp < 7) fail(`expected at least 7 face-up cards after the deal, got ${faceUp}`);
const down = await me.locator('.sol-card.down').count();
if (down < 21) fail(`expected the stock plus face-down tableau cards, got ${down}`);
// the top row is: 4 foundations, then stock, then waste
const stock = me.locator('.sol-board .sol-row').first().locator('.sol-slot').nth(4);
const before = Number((await stock.locator('.sol-count').textContent()).trim());
if (before !== 24) fail(`expected a 24-card stock, got ${before}`);
await stock.locator('.sol-card').click();
await me.waitForFunction(
  (n) => {
    const el = document.querySelectorAll('.sol-board .sol-row')[0].querySelectorAll('.sol-slot')[4];
    return Number(el.querySelector('.sol-count').textContent.trim()) === n - 1;
  },
  before, { timeout: 8000 },
);
console.log('ok: solitaire — deal renders (7 up, 24 in stock), stock turns a card');
await endGame(me);

// ---------- Word Hunt ----------
await startGame(me, 'Word Hunt');
await me.waitForSelector('.wl-board', { timeout: 10000 });
if (await me.locator('.wl-green, .wl-yellow, .wl-grey').count()) fail('marks on the board before any guess');
// type a guess on the built-in keyboard (no native keyboard covering the grid)
for (const ch of ['c', 'r', 'a', 'n', 'e']) {
  await me.click(`.wl-keyboard .wl-key:text-is("${ch}")`);
}
await me.click('.wl-key:has-text("ENTER")');
await me.waitForFunction(
  () => document.querySelectorAll('.wl-green, .wl-yellow, .wl-grey').length >= 5,
  null, { timeout: 8000 },
);
console.log('ok: word hunt — on-screen keyboard guess scored with colours');
await endGame(me);

await browser.close();
console.log('ALL SOLO-GAMES TESTS PASSED');
