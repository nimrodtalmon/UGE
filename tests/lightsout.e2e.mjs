// e2e test — needs a freshly started brain (UGE_NO_OPEN=1 npm run start:once) on :8000
// and a Chromium binary (default /opt/pw-browsers/chromium, override with UGE_CHROMIUM).
import { chromium } from 'playwright-core';

const exe = process.env.UGE_CHROMIUM ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe, headless: true });
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

// table screen
const tableCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const table = await tableCtx.newPage();
table.on('pageerror', (e) => fail(`table pageerror: ${e.message}`));
await table.goto('http://localhost:8000/');
await table.waitForSelector('img[alt^="Join QR"]', { timeout: 10000 });
console.log('ok: table page up with QR');

// phone
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const phone = await phoneCtx.newPage();
phone.on('pageerror', (e) => fail(`phone pageerror: ${e.message}`));
await phone.goto('http://localhost:8000/join');
await phone.fill('input', 'Nimrod');
await phone.click('button:has-text("Join the lobby")');
await phone.waitForSelector('h2:has-text("At the table")', { timeout: 10000 });
console.log('ok: phone joined lobby');

// table tile appears on phone; phone tile on table
await table.waitForSelector('.tile:has-text("Nimrod")', { timeout: 10000 });
console.log('ok: phone tile visible on table');

// table selects lights out (no player claims yet — selection must work)
await table.click('button.game:has-text("Lights Out")');
await table.waitForSelector('.blockers', { timeout: 5000 });
console.log('ok: table selected Lights Out, blockers shown:', (await table.textContent('.blockers')).trim());

// phone claims player
await phone.waitForSelector('button:has-text("Join as player")', { timeout: 10000 });
await phone.click('button:has-text("Join as player")');
await table.waitForSelector('button:has-text("Start Lights Out"):not([disabled])', { timeout: 10000 });
console.log('ok: start enabled after claim');

// start from the table
await table.click('button:has-text("Start Lights Out")');
await table.waitForSelector('.lo-grid', { timeout: 10000 });
await phone.waitForSelector('.lo-grid', { timeout: 10000 });
console.log('ok: game views rendered on both screens (react shim works)');

// count lit cells, press one on the phone, verify table updates
const litBefore = await table.locator('.lo-cell.on').count();
await phone.click('.lo-cell >> nth=12');
await phone.waitForFunction(() => document.querySelector('.lo-status')?.textContent?.includes('1 moves'), null, { timeout: 5000 });
await table.waitForFunction(() => document.querySelector('.lo-status')?.textContent?.includes('1 moves'), null, { timeout: 5000 });
const litAfter = await table.locator('.lo-cell.on').count();
console.log(`ok: phone move propagated to table (lit ${litBefore} -> ${litAfter})`);

// press a cell on the table itself
await table.click('.lo-cell >> nth=0');
await table.waitForFunction(() => document.querySelector('.lo-status')?.textContent?.includes('2 moves'), null, { timeout: 5000 });
console.log('ok: table can also press cells');

// end game from table -> both back in lobby
await table.click('button:has-text("End game")');
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 5000 });
await phone.waitForSelector('h2:has-text("At the table")', { timeout: 5000 });
console.log('ok: end game returns everyone to the lobby');

if (process.env.SCRATCH) await table.screenshot({ path: process.env.SCRATCH + '/table.png' });
await browser.close();
console.log('ALL BROWSER TESTS PASSED');
