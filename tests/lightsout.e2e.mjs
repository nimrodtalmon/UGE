// e2e test — needs a freshly started brain (UGE_NO_OPEN=1 npm run start:once) on :8000
// and a Chromium binary (default /opt/pw-browsers/chromium, override with UGE_CHROMIUM).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.UGE_CHROMIUM ?? '/opt/pw-browsers/chromium', headless: true });
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const table = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
table.on('pageerror', (e) => fail(`table pageerror: ${e.message}`));
await table.goto('http://localhost:8000/');
// the game-night wizard comes first: 1 player, phones follow automatically
await table.waitForSelector('.st-players', { timeout: 10000 });
for (let i = 0; i < 3; i++) await table.click('.st-players button:has-text("−")');
const shown = await table.textContent('.st-phones strong');
if (shown.trim() !== '1') fail(`phones did not follow players: ${shown}`);
await table.click('button:has-text("Continue")');
await table.waitForSelector('img[alt^="Join QR"]', { timeout: 10000 });
await table.waitForSelector('p:has-text("1 player · 1 phone")', { timeout: 5000 });
console.log('ok: setup wizard → 1 player / 1 phone, table page up with QR');

const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
phone.on('pageerror', (e) => fail(`phone pageerror: ${e.message}`));
await phone.goto('http://localhost:8000/join');
await phone.fill('input', 'Nimrod');
await phone.click('button:has-text("Join the lobby")');
await phone.waitForSelector('h2:has-text("At the table")', { timeout: 10000 });
await table.waitForSelector('.tile:has-text("Nimrod")', { timeout: 10000 });
console.log('ok: phone joined, tile on table');

// only fitting games show; the rest hide behind an expander
await table.waitForSelector('button.game.ready:has-text("Lights Out")', { timeout: 10000 });
if (await table.locator('button.game:has-text("Memory")').count()) fail('non-fitting game visible before expanding');
await table.click('.games-more');
const memoryReason = (await table.textContent('button.game:has-text("Memory")')).trim();
if (!memoryReason.includes('for 2+ players')) fail(`memory reason wrong: ${memoryReason}`);
console.log('ok: non-fitting games hidden until expanded, with reasons');

await table.click('button.game:has-text("Lights Out")');
// auto-join: start enables without any claim tap
await table.waitForSelector('button:has-text("Start Lights Out"):not([disabled])', { timeout: 10000 });
await phone.waitForSelector('p:has-text("in as")', { timeout: 10000 });
console.log('ok: phone auto-joined as player');

await table.click('button:has-text("Start Lights Out")');
await table.waitForSelector('.lo-grid', { timeout: 10000 });
await phone.waitForSelector('.lo-grid', { timeout: 10000 });
console.log('ok: game views rendered on both screens');

if (await table.locator('.lo-cell:not([disabled])').count()) fail('table board should be display-only');
console.log('ok: table board is display-only');

const litBefore = await table.locator('.lo-cell.on').count();
await phone.click('.lo-cell >> nth=12');
await phone.waitForFunction(() => document.querySelector('.lo-status')?.textContent?.includes('1 moves'), null, { timeout: 5000 });
await table.waitForFunction(() => document.querySelector('.lo-status')?.textContent?.includes('1 moves'), null, { timeout: 5000 });
const litAfter = await table.locator('.lo-cell.on').count();
console.log(`ok: phone move propagated to table (lit ${litBefore} -> ${litAfter})`);

await table.click('button:has-text("End game")');
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 5000 });
console.log('ok: end game returns everyone to the lobby');

if (process.env.SCRATCH) await table.screenshot({ path: process.env.SCRATCH + '/table.png' });
await browser.close();
console.log('ALL LIGHTSOUT TESTS PASSED');
