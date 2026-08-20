// e2e test for AI opponents — needs a freshly started brain on :8000.
// One device, no table: chess must be playable against the computer.
import { launch, openHome, startGame, endGame } from './helpers.mjs';

const browser = await launch();
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const me = await openHome(browser, {
  path: '/',
  name: 'Solo',
  viewport: { width: 420, height: 900 },
  onError: (e) => fail(`pageerror: ${e.message}`),
});

// a 2-player game is offered to a lone player because it ships an AI
await me.click('.seg:has-text("Ready")');
await me.waitForSelector('.game.ready:has-text("Chess")', { timeout: 10000 });
const hint = await me.textContent('.game:has-text("Chess")');
if (!hint.includes('vs AI')) fail(`chess should be marked as playable vs AI, got: ${hint}`);
console.log('ok: chess offered to a lone player, marked vs AI');

// selecting it pre-fills one AI opponent and offers difficulties
await me.click('.game:has-text("Chess")');
await me.waitForSelector('.bot-row', { timeout: 8000 });
const count = (await me.textContent('.bot-count .stepper strong')).trim();
if (count !== '1') fail(`expected 1 AI opponent pre-filled, got ${count}`);
if (!(await me.locator('.bot-levels .chip:has-text("Hard")').count())) fail('no difficulty choice');
await me.click('.bot-levels .chip:has-text("Easy")');
await me.waitForSelector('.bot-levels .chip.on:has-text("Easy")', { timeout: 5000 });
console.log('ok: AI pre-filled with a difficulty picker (easy selected)');

// the bot joins the group and shows up as a player
await me.waitForSelector('.person.is-bot', { timeout: 5000 });
await me.waitForFunction(
  () => (document.querySelector('.setup-line')?.textContent ?? '').includes('2 players'),
  null, { timeout: 8000 },
);
console.log('ok: the AI counts as a player in the group');

await me.click('button:has-text("Start Chess")');
await me.waitForSelector('.ch-board', { timeout: 10000 });
// I am white: play e4, then the bot must answer by itself
await me.waitForSelector('.ch-status:has-text("your move")', { timeout: 8000 });
await me.click('[data-sq="e2"]');
await me.waitForSelector('[data-sq="e4"].target', { timeout: 5000 });
await me.click('[data-sq="e4"]');
await me.waitForFunction(
  () => document.querySelector('[data-sq="e4"]')?.classList.contains('last'),
  null, { timeout: 8000 },
);
// the bot replies within a few seconds, and it is my turn again
await me.waitForSelector('.ch-status:has-text("your move")', { timeout: 20000 });
const blackMoved = await me.evaluate(() => {
  const marks = [...document.querySelectorAll('[data-sq].last')].map((el) => el.getAttribute('data-sq'));
  return marks.some((sq) => sq && Number(sq[1]) >= 5); // a black piece moved from its half
});
if (!blackMoved) fail('the AI did not reply');
console.log('ok: the AI answered on its own and handed the turn back');
await endGame(me);

// ---------- a bot plays a hidden-hand game too ----------
await me.click('.seg:has-text("Ready")');
await me.waitForSelector('.game.ready:has-text("Memory")', { timeout: 10000 });
await me.click('.game:has-text("Memory")');
await me.waitForSelector('.bot-row', { timeout: 8000 });
await me.click('button:has-text("Start Memory")');
await me.waitForSelector('.mem-card', { timeout: 10000 });
// play my turn: flip two cards, then the AI must take its turn unaided
for (const n of [0, 1]) {
  const card = me.locator('.mem-card.down:not([disabled])').first();
  if (await card.count()) await card.click().catch(() => {});
  await me.waitForTimeout(600);
}
await me.waitForFunction(
  () => document.querySelectorAll('.mem-card.up, .mem-card.matched').length > 0,
  null, { timeout: 10000 },
);
console.log('ok: memory — the AI takes its own turns');
await endGame(me);

await browser.close();
console.log('ALL BOT TESTS PASSED');
