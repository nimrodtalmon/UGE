// e2e test for public mode + rooms — needs a freshly started brain with
// UGE_PUBLIC=1 (UGE_PUBLIC=1 UGE_NO_OPEN=1 npm run start:once) on :8000.
import { chromium } from 'playwright-core';
// public mode: landing page → rooms; the home screen replaces the old wizard.

const browser = await chromium.launch({ executablePath: process.env.UGE_CHROMIUM ?? '/opt/pw-browsers/chromium', headless: true });
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

// landing page: host a room
const table = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
table.on('pageerror', (e) => fail(`table pageerror: ${e.message}`));
await table.goto('http://localhost:8000/');
await table.waitForSelector('button:has-text("Host a game night")', { timeout: 10000 });
console.log('ok: public landing page shows Host');

await table.click('button:has-text("Host a game night")');
await table.waitForURL(/\/r\/[A-Z2-9]{4}$/, { timeout: 10000 });
const codeA = new URL(table.url()).pathname.split('/')[2];
console.log(`ok: hosted room ${codeA}`);

// the room's home screen is the usual lobby; its session/QR carry the room path
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 10000 });
const sess = await table.evaluate(async (code) => (await fetch(`/r/${code}/api/session`)).json(), codeA);
if (!sess.joinUrl.endsWith(`/r/${codeA}/join`)) fail(`joinUrl not room-scoped: ${sess.joinUrl}`);
if (sess.updatable !== false) fail('public mode must not offer in-place updates');
if (sess.roomCode !== codeA) fail('session missing roomCode');
console.log('ok: room session — scoped joinUrl, no Update, code exposed');

await table.click('button:has-text("Add people")');
if (await table.locator('.room-foot button:has-text("Update")').count()) fail('Update button visible in public mode');
await table.click('.room-close');
if (!(await table.textContent('.room-chip')).includes(codeA)) fail('home screen does not show the room code');
console.log('ok: room table shows lobby with room code, Update hidden');

// a second room, hosted via the API, is invisible to the first
const r2 = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
r2.on('pageerror', (e) => fail(`room-b pageerror: ${e.message}`));
const codeB = (await (await fetch('http://localhost:8000/api/rooms', { method: 'POST' })).json()).code;
if (codeB === codeA) fail('duplicate room codes');
await r2.goto(`http://localhost:8000/r/${codeB}`);
await r2.waitForSelector('h2:has-text("Pick a game")', { timeout: 10000 });

// phone joins room A only
const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
phone.on('pageerror', (e) => fail(`phone pageerror: ${e.message}`));
await phone.addInitScript(() => {
  localStorage.setItem('uge:name', 'Roomer');
  localStorage.setItem('uge:avatar', '🦊');
});
await phone.goto(`http://localhost:8000/r/${codeA}/join`);
await table.waitForSelector('.tile:has-text("Roomer")', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 2500)); // a couple of room-B polls
if (await r2.locator('.tile:has-text("Roomer")').count()) fail('device leaked between rooms');
console.log('ok: two rooms, device visible only in its own room');

// a full game runs inside the room (the host screen takes the table role)
await table.click('button:has-text("Add people")');
await table.click('button:has-text("use as the table")');
await table.waitForSelector('button:has-text("acting as the table")', { timeout: 8000 });
await table.click('.room-close');
await table.click('button.game:has-text("Lights Out")');
await table.waitForSelector('button:has-text("Start Lights Out"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Lights Out")');
await phone.waitForSelector('.lo-grid', { timeout: 10000 });
await table.waitForSelector('.lo-grid', { timeout: 10000 });
if (await r2.locator('.lo-grid').count()) fail('game leaked into the other room');
console.log('ok: game started inside the room; other room unaffected');

// bad room codes bounce to the landing page
await r2.goto('http://localhost:8000/r/zz');
await r2.waitForSelector('button:has-text("Host a game night")', { timeout: 10000 });
// legacy /join redirects to the landing in public mode
await r2.goto('http://localhost:8000/join');
await r2.waitForSelector('button:has-text("Host a game night")', { timeout: 10000 });
console.log('ok: bad code and legacy /join land on the landing page');

await browser.close();
console.log('ALL ROOMS TESTS PASSED');
