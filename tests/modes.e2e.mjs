// e2e test — needs a freshly started brain (UGE_NO_OPEN=1 npm run start:once) on :8000
// and a Chromium binary (default /opt/pw-browsers/chromium, override with UGE_CHROMIUM).
// Covers the shared-phone modes: 4 declared players, 1 declared phone.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.UGE_CHROMIUM ?? '/opt/pw-browsers/chromium', headless: true });
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const table = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
table.on('pageerror', (e) => fail(`table pageerror: ${e.message}`));
await table.goto('http://localhost:8000/');
await table.evaluate(() => fetch('/api/lobby/setup', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ players: 4, phones: 1 }),
}));
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 10000 });

const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
phone.on('pageerror', (e) => fail(`phone pageerror: ${e.message}`));
await phone.goto('http://localhost:8000/join');
await phone.fill('input', 'Nimrod');
await phone.click('button:has-text("Join the lobby")');

// pass-capable games fit 4 players / 1 phone; phone-per-player games hide
for (const name of ['Memory', 'Alias', 'UNO', 'Codenames']) {
  if (!(await table.locator(`button.game.ready:has-text("${name}")`).count())) {
    await table.waitForTimeout(1500);
    if (!(await table.locator(`button.game.ready:has-text("${name}")`).count())) fail(`${name} should fit 4p/1phone`);
  }
}
if (await table.locator('button.game:has-text("Poker")').count()) fail('Poker should be hidden (needs a phone per player)');
console.log('ok: only shared-phone-capable games fit 4 players / 1 phone');

async function endGame() {
  await table.click('button:has-text("End game")');
  await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 5000 });
}

// ---------- Memory: pass the phone ----------
await table.click('button.game:has-text("Memory")');
// only one mode fits 3p/1phone — the table picks it silently, no picker
await table.waitForSelector('button:has-text("Start Memory"):not([disabled])', { timeout: 10000 });
if (await table.locator('.mode-row').count()) fail('mode picker shown though only one mode fits');
await table.click('button:has-text("Start Memory")');
await phone.waitForSelector('.mem-card.down:not([disabled])', { timeout: 10000 });
await phone.waitForSelector('p:has-text("Player 1")', { timeout: 5000 });
await phone.click('.mem-card >> nth=0');
await phone.waitForFunction(() => !document.querySelectorAll('.mem-card')[0].classList.contains('down'), null, { timeout: 5000 });
console.log('ok: memory pass mode — virtual seats, any hand flips');
await endGame();

// ---------- UNO: hotseat ----------
await table.click('button.game:has-text("UNO")');
await table.waitForSelector('button:has-text("Start UNO"):not([disabled])', { timeout: 10000 });
if (await table.locator('.mode-row').count()) fail('mode picker shown though only one mode fits');
await table.click('button:has-text("Start UNO")');
// locked cover screen first — no cards visible
await phone.waitForSelector('.wc-pass-name:has-text("Player 1")', { timeout: 10000 });
if (await phone.locator('.wc-hand .wc-slot').count()) fail('cards visible while locked');
await phone.click('button:has-text("show my cards")');
await phone.waitForSelector('.wc-hand .wc-slot', { timeout: 5000 });
const cards = await phone.locator('.wc-hand .wc-slot').count();
if (cards !== 7) fail(`expected 7 cards after unlock, got ${cards}`);
// take a turn (play or draw), then the phone must lock for the next player
for (let i = 0; i < 6; i++) {
  if (await phone.locator('.wc-picker').count()) { await phone.click('.wc-pick >> nth=0'); continue; }
  if (await phone.locator('.wc-pass-name').count()) break;
  const playable = phone.locator('.wc-slot.playable');
  if (await playable.count()) await playable.first().click({ timeout: 1500 }).catch(() => {});
  else {
    const keep = phone.locator('button:has-text("Keep it")');
    if (await keep.count()) await keep.click({ timeout: 1500 }).catch(() => {});
    else await phone.locator('button:has-text("Draw a card")').click({ timeout: 1500 }).catch(() => {});
  }
  await phone.waitForTimeout(400);
}
// action cards can skip ahead — just require the lock screen for SOME other player
await phone.waitForSelector('.wc-pass-name', { timeout: 10000 });
const nextName = (await phone.textContent('.wc-pass-name')).trim();
if (nextName === 'Player 1') fail('phone still shows Player 1 after their turn');
console.log(`ok: UNO hotseat — locked handoff to ${nextName}`);
await endGame();

// ---------- Codenames: one shared phone ----------
await table.click('button.game:has-text("Codenames")');
await phone.waitForSelector('button:has-text("Become spymasters")', { timeout: 10000 });
await phone.click('button:has-text("Become spymasters")');
await table.waitForSelector('button:has-text("Start Codenames"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Codenames")');
await phone.waitForSelector('.cn-card.hint', { timeout: 10000 });
// the map device can tap guesses in this mode
await phone.click('.cn-card >> nth=3');
await phone.waitForFunction(() => document.querySelectorAll('.cn-card')[3].classList.contains('revealed'), null, { timeout: 5000 });
if (!(await phone.locator('button:has-text("End")').count())) fail('map device missing end-turn in solo mode');
console.log('ok: codenames one-phone — map device sees key AND records guesses');
await endGame();

// ---------- Alias: pass the phone ----------
await table.click('button.game:has-text("Alias")');
await table.waitForSelector('button:has-text("Start Alias"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Alias")');
await phone.waitForSelector('button:has-text("Start the round")', { timeout: 10000 });
await table.waitForSelector('h1:has-text("Round 1 of 4")', { timeout: 5000 });
if (!(await table.textContent('h1.al-big')).includes('Red team')) fail('team round banner missing');
await phone.click('button:has-text("Start the round")');
await phone.waitForSelector('.al-word', { timeout: 5000 });
await phone.click('button:has-text("Got it")');
await phone.waitForSelector('p:has-text("score this round: 1")', { timeout: 5000 });
console.log('ok: alias TEAM mode — 4 alternating team rounds, shared phone explains');
await endGame();

await browser.close();
console.log('ALL MODES TESTS PASSED');
