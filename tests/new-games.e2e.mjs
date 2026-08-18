// e2e test — needs a freshly started brain (UGE_NO_OPEN=1 npm run start:once) on :8000
// and a Chromium binary (default /opt/pw-browsers/chromium, override with UGE_CHROMIUM).
// Chess, Sketch, and Rummikub with 2 players / 2 phones.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.UGE_CHROMIUM ?? '/opt/pw-browsers/chromium', headless: true });
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const table = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
table.on('pageerror', (e) => fail(`table pageerror: ${e.message}`));
await table.goto('http://localhost:8000/');
await table.evaluate(() => fetch('/api/lobby/setup', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ players: 2, phones: 2 }),
}));
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 10000 });

const phones = [];
for (const name of ['Nimrod', 'Dana']) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', (e) => fail(`${name} pageerror: ${e.message}`));
  await p.goto('http://localhost:8000/join');
  await p.fill('input', name);
  await p.click('button:has-text("Join the lobby")');
  phones.push(p);
}

async function endGame() {
  await table.click('button:has-text("End game")');
  await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 5000 });
}

// ---------- Chess: scholar's mate ----------
await table.click('button.game:has-text("Chess")');
await table.waitForSelector('button:has-text("Start Chess"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Chess")');
for (const p of phones) await p.waitForSelector('.ch-board', { timeout: 10000 });
console.log('ok: chess started, boards everywhere');

// seat order == join order: phones[0] is white
async function chessMove(p, from, to) {
  await p.waitForSelector('.ch-status:has-text("your move")', { timeout: 8000 });
  await p.click(`[data-sq="${from}"]`);
  await p.waitForSelector(`[data-sq="${to}"].target`, { timeout: 5000 });
  await p.click(`[data-sq="${to}"]`);
  await p.waitForFunction(
    (sq) => document.querySelector(`[data-sq="${sq}"]`)?.classList.contains('last'),
    to, { timeout: 8000 },
  );
}
const [white, black] = phones;
await chessMove(white, 'e2', 'e4');
await chessMove(black, 'e7', 'e5');
await chessMove(white, 'd1', 'h5');
await chessMove(black, 'b8', 'c6');
await chessMove(white, 'f1', 'c4');
await chessMove(black, 'g8', 'f6');
await chessMove(white, 'h5', 'f7');
await table.waitForSelector('.ch-status:has-text("Checkmate")', { timeout: 8000 });
if (!(await table.textContent('.ch-status')).includes('Nimrod')) fail('wrong checkmate winner');
console.log('ok: scholar’s mate — checkmate detected, White wins');
await endGame();

// ---------- Sketch ----------
await table.click('button.game:has-text("Sketch")');
await table.waitForSelector('button:has-text("Start Sketch"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Sketch")');
await phones[0].waitForSelector('.sk-pad', { timeout: 10000 });
const word = (await phones[0].textContent('.sk-word')).trim();
if (!word) fail('drawer has no word');
if ((await phones[1].content()).includes(`>${word}<`)) fail('guesser can see the word');
console.log(`ok: sketch started — drawer sees the word, guesser does not`);

// draw a stroke with the mouse; it must reach the table
const pad = await phones[0].locator('.sk-pad').boundingBox();
await phones[0].mouse.move(pad.x + pad.width * 0.2, pad.y + pad.height * 0.3);
await phones[0].mouse.down();
await phones[0].mouse.move(pad.x + pad.width * 0.7, pad.y + pad.height * 0.6, { steps: 8 });
await phones[0].mouse.up();
await table.waitForSelector('.sk-picture polyline', { timeout: 8000 });
console.log('ok: stroke drawn on the phone shows on the table');

// wrong guess appears on the table ticker; right guess scores and ends the round
await phones[1].fill('.sk-guess', 'xyzzy');
await phones[1].click('button:has-text("Guess")');
await table.waitForSelector('.sk-wrong:has-text("xyzzy")', { timeout: 8000 });
await phones[1].fill('.sk-guess', word);
await phones[1].click('button:has-text("Guess")');
// the only guesser got it — the round flips straight to the reveal
await phones[1].waitForSelector('.sk-status:has-text("it was")', { timeout: 8000 });
await table.waitForSelector(`.sk-status:has-text("it was")`, { timeout: 8000 });
console.log('ok: wrong guess shown, right guess scores, reveal reached');
// round 2 starts by itself and the OTHER phone becomes the drawer
await phones[1].waitForSelector('.sk-pad', { timeout: 15000 });
console.log('ok: next round auto-started with the other drawer');
await endGame();

// ---------- Rummikub ----------
await table.click('button.game:has-text("Rummikub")');
await table.waitForSelector('button:has-text("Start Rummikub"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Rummikub")');
await phones[0].waitForSelector('.rk-rack', { timeout: 10000 });
const rackTiles = await phones[0].locator('.rk-rack .rk-tile').count();
if (rackTiles !== 14) fail(`expected 14 rack tiles, got ${rackTiles}`);
if (await table.locator('.rk-rack').count()) fail('table shows a rack');
await table.waitForSelector('.rk-pool:has-text("pool 78")', { timeout: 5000 }); // 106 - 2*14
console.log('ok: rummikub started — 14 tiles each, racks private, pool 78');

// staging: two tiles are never a valid set
await phones[0].click('.rk-rack .rk-tile >> nth=0');
await phones[0].click('.rk-rack .rk-tile >> nth=1');
if (await phones[0].locator('button:has-text("Lay as set"):not([disabled])').count()) {
  fail('two tiles should not be layable');
}
await phones[0].click('.rk-rack .rk-tile >> nth=0');
await phones[0].click('.rk-rack .rk-tile >> nth=1');

// current player draws; rack grows and the turn passes
const current = (await phones[0].locator('.rk-turn.mine').count()) ? phones[0] : phones[1];
const other = current === phones[0] ? phones[1] : phones[0];
await current.click('button:has-text("Draw")');
await current.waitForFunction(
  () => document.querySelectorAll('.rk-rack .rk-tile').length === 15,
  null, { timeout: 8000 },
);
await other.waitForSelector('.rk-turn.mine', { timeout: 8000 });
await table.waitForSelector('.rk-pool:has-text("pool 77")', { timeout: 8000 });
console.log('ok: draw works, turn passes, pool shrinks');
await endGame();

await browser.close();
console.log('ALL NEW-GAMES TESTS PASSED');
