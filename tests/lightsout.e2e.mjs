// e2e test — needs a freshly started brain (UGE_NO_OPEN=1 npm run start:once) on :8000
// and a Chromium binary (default /opt/pw-browsers/chromium, override with UGE_CHROMIUM).
// The platform flow: land ready to play, add people, hand over the table role.
import { launch, openHome, beTable, setSeats, startGame, endGame } from './helpers.mjs';

const browser = await launch();
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

// ---------- opening UGE puts you straight in the game, alone ----------
const host = await openHome(browser, {
  path: '/',
  name: 'Nimrod',
  viewport: { width: 1280, height: 860 },
  onError: (e) => fail(`host pageerror: ${e.message}`),
});
if (!(await host.textContent('.setup-line')).includes('1 player · 1 device')) {
  fail('a lone device should be a 1-player group');
}
await host.waitForSelector('button.game.ready:has-text("Lights Out")', { timeout: 8000 });
if (await host.locator('button.game:has-text("Memory")').count()) fail('2-player game visible with 1 player');
console.log('ok: no wizard — one device lands as a 1-player group with fitting games');

// solo play with no table screen at all
await startGame(host, 'Lights Out');
await host.waitForSelector('.lo-grid', { timeout: 10000 });
await host.click('.lo-cell >> nth=12');
await host.waitForFunction(() => document.querySelector('.lo-status')?.textContent?.includes('1 moves'), null, { timeout: 5000 });
if (!(await host.locator('button:has-text("End game")').count())) fail('no game controls without a table');
console.log('ok: solo play on one device — no table screen involved');
await endGame(host);

// ---------- a phone joins: the group grows by itself ----------
const phone = await openHome(browser, {
  path: '/join',
  name: 'Dana',
  onError: (e) => fail(`phone pageerror: ${e.message}`),
});
await host.waitForSelector('.tile:has-text("Dana")', { timeout: 10000 });
await host.waitForFunction(
  () => document.querySelector('.setup-line')?.textContent?.includes('2 players · 2 devices'),
  null, { timeout: 8000 },
);
// Lights Out is 1-player only, so it drops out of the fitting list
await host.waitForFunction(
  () => !document.querySelector('button.game:not(.games-more)')?.textContent?.includes('Lights Out'),
  null, { timeout: 8000 },
);
await host.click('.games-more');
const reason = (await host.textContent('button.game:has-text("Lights Out")')).trim();
if (!reason.includes('up to 1 player')) fail(`expected a fit reason, got: ${reason}`);
console.log('ok: a second device joins — group and game list follow automatically');

// ---------- hand the big screen the table role ----------
await beTable(host);
await host.waitForFunction(
  () => document.querySelector('.setup-line')?.textContent?.includes('1 player · 1 device · table screen'),
  null, { timeout: 8000 },
);
await startGame(host, 'Lights Out');
await host.waitForSelector('.lo-grid', { timeout: 10000 });
await phone.waitForSelector('.lo-grid', { timeout: 10000 });
if (await host.locator('.lo-cell:not([disabled])').count()) fail('table board should be display-only');
console.log('ok: table role handed over — board on the table, controls on the phone');

await phone.click('.lo-cell >> nth=12');
await host.waitForFunction(() => document.querySelector('.lo-status')?.textContent?.includes('1 moves'), null, { timeout: 6000 });
console.log('ok: phone move propagated to the table');

// mid-game rename via the floating chip must reach the running game
await phone.click('.profile-chip');
await phone.waitForSelector('.avatar-grid', { timeout: 5000 });
await phone.fill('input', 'Zorro');
await phone.click('button:has-text("Save")');
await phone.waitForSelector('p.lo-hint:has-text("Zorro")', { timeout: 8000 });
console.log('ok: mid-game rename shows in the running game');

await endGame(host);
await host.waitForSelector('.tile:has-text("Zorro")', { timeout: 8000 });
console.log('ok: end game returns everyone to the lobby, rename kept');

// ---------- "3 of us on this phone" grows the group without more devices ----------
await setSeats(phone, 3);
await host.waitForFunction(
  () => document.querySelector('.setup-line')?.textContent?.includes('3 players · 1 device'),
  null, { timeout: 8000 },
);
await host.waitForSelector('button.game.ready:has-text("Memory")', { timeout: 8000 });
console.log('ok: shared-device seats unlock pass-the-phone games');

if (process.env.SCRATCH) await host.screenshot({ path: process.env.SCRATCH + '/table.png' });
await browser.close();
console.log('ALL LIGHTSOUT TESTS PASSED');
