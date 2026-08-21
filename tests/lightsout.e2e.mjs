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
const groupLine = await host.textContent('.setup-line');
if (!groupLine.includes('1 player') || !groupLine.includes('1 device')) {
  fail(`a lone device should be a 1-player group, got: ${groupLine}`);
}
await host.waitForSelector('button.game.ready:has-text("Lights Out")', { timeout: 8000 });
// Codenames needs 4 humans and ships no AI, so it must stay out of a lone
// player's Ready list (Hearts no longer qualifies — it can fill seats with bots)
if (await host.locator('button.game.ready:has-text("Codenames")').count()) {
  fail('4-player game with no AI shown as ready for 1 player');
}
console.log('ok: no wizard — one device lands as a 1-player group with fitting games');

// the grid must not reshuffle under your finger when you pick a game
const orderOf = () => host.$$eval('.game .game-name', (els) => els.map((e) => e.textContent));
const orderBefore = await orderOf();
await host.click('.game:has-text("Lights Out")');
await host.waitForSelector('.game.selected:has-text("Lights Out")', { timeout: 5000 });
await host.waitForTimeout(2500); // a couple of polls
const orderAfter = await orderOf();
if (JSON.stringify(orderBefore) !== JSON.stringify(orderAfter)) {
  fail(`game list reordered on select:\n  ${orderBefore.join(', ')}\n  ${orderAfter.join(', ')}`);
}
console.log('ok: picking a game leaves the list order untouched');

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
  () => {
    const t = document.querySelector('.setup-line')?.textContent ?? '';
    return t.includes('2 players') && t.includes('2 devices');
  },
  null, { timeout: 8000 },
);
// Lights Out is 1-player only, so it drops out of the Ready tab
await host.waitForFunction(
  () => ![...document.querySelectorAll('.game')].some((el) => el.textContent.includes('Lights Out')),
  null, { timeout: 8000 },
);
await host.click('.seg:has-text("All")');
await host.waitForSelector('.game.locked:has-text("Lights Out")', { timeout: 8000 });
const reason = (await host.textContent('.game:has-text("Lights Out")')).trim();
if (!reason.includes('up to 1 player')) fail(`expected a fit reason, got: ${reason}`);
await host.click('.seg:has-text("Ready")');
console.log('ok: a second device joins — group and game list follow automatically');

// ---------- hand the big screen the table role ----------
await beTable(host);
await host.waitForFunction(
  () => {
    const t = document.querySelector('.setup-line')?.textContent ?? '';
    return t.includes('1 player') && t.includes('1 device') && t.includes('table screen');
  },
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
  () => {
    const t = document.querySelector('.setup-line')?.textContent ?? '';
    return t.includes('3 players') && t.includes('1 device');
  },
  null, { timeout: 8000 },
);
await host.waitForSelector('button.game.ready:has-text("Memory")', { timeout: 8000 });
console.log('ok: shared-device seats unlock pass-the-phone games');

if (process.env.SCRATCH) await host.screenshot({ path: process.env.SCRATCH + '/table.png' });
await browser.close();
console.log('ALL LIGHTSOUT TESTS PASSED');
