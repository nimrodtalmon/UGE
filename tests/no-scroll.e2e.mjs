// e2e guard — needs a freshly started brain on :8000.
// A game screen must never need scrolling: the platform gives it a fixed
// viewport box, and anything taller than that is a layout bug on a phone.
import { launch, openHome, startGame, endGame } from './helpers.mjs';

const browser = await launch();
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

// a small, common phone — if it fits here it fits everywhere
const me = await openHome(browser, {
  path: '/',
  name: 'Probe',
  viewport: { width: 360, height: 640 },
  onError: (e) => fail(`pageerror: ${e.message}`),
});

// Solo games only fit a ONE-player group, so wait out any devices a previous
// suite left behind (they are pruned after ~45s) before taking the list.
await me.waitForFunction(
  () => (document.querySelector('.setup-line')?.textContent ?? '').includes('1 player'),
  null, { timeout: 70000 },
);
await me.click('.seg:has-text("Solo")');
const games = await me.$$eval('.game.ready .game-name', (els) => els.map((e) => e.textContent.trim()));
if (games.length < 10) fail(`expected at least 10 solo games, got ${games.length}: ${games}`);

const bad = [];
for (const name of games) {
  await startGame(me, name);
  await me.waitForTimeout(900); // let the view settle (and any bot move land)
  const over = await me.evaluate(() => {
    const v = document.querySelector('.game-viewport');
    const page = document.documentElement.scrollHeight - window.innerHeight;
    return v ? { box: v.scrollHeight - v.clientHeight, page } : { box: -1, page };
  });
  if (over.box > 4 || over.page > 4) bad.push(`${name}: box +${over.box}px, page +${over.page}px`);
  await endGame(me);
}
if (bad.length) fail(`game screens need scrolling on a 360x640 phone:\n  ${bad.join('\n  ')}`);
console.log(`ok: all ${games.length} solo-startable games fit a 360x640 screen with no scrolling`);

await browser.close();
console.log('ALL NO-SCROLL TESTS PASSED');
