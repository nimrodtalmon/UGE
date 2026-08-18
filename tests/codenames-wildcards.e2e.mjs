// e2e test — needs a freshly started brain (UGE_NO_OPEN=1 npm run start:once) on :8000
// and a Chromium binary (default /opt/pw-browsers/chromium, override with UGE_CHROMIUM).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.UGE_CHROMIUM ?? '/opt/pw-browsers/chromium', headless: true });
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const table = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
table.on('pageerror', (e) => fail(`table pageerror: ${e.message}`));
await table.goto('http://localhost:8000/');

const phones = [];
for (const name of ['Nimrod', 'Dana', 'Ben', 'Noa']) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', (e) => fail(`${name} pageerror: ${e.message}`));
  await p.goto('http://localhost:8000/join');
  await p.fill('input', name);
  await p.click('button:has-text("Join the lobby")');
  phones.push(p);
}

// ---------- Codenames ----------
await table.click('button.game:has-text("Codenames")');
await phones[0].waitForSelector('button:has-text("Become spymaster red")', { timeout: 10000 });
await phones[0].click('button:has-text("Become spymaster red")');
await phones[1].click('button:has-text("Become spymaster blue")');
await table.waitForSelector('button:has-text("Start Codenames"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Codenames")');
await table.waitForSelector('.cn-board', { timeout: 10000 });
console.log('ok: codenames started (spymasters claimed, extras gating worked)');

const spym = phones[0]; // red spymaster
const operative = phones[2];
await spym.waitForSelector('.cn-card.hint', { timeout: 10000 });

// privacy: only spymasters see key hints; operatives and table see plain cards
if (await table.locator('.cn-card.hint').count()) fail('table sees the key');
await operative.waitForSelector('.cn-board', { timeout: 10000 });
if (await operative.locator('.cn-card.hint').count()) fail('operative sees the key');
const hintCount = await spym.locator('.cn-card.hint').count();
if (hintCount !== 25) fail(`spymaster sees ${hintCount}/25 key hints`);
console.log('ok: key card visible only to spymasters');

// read the key from the red spymaster's DOM
const key = await spym.evaluate(() =>
  [...document.querySelectorAll('.cn-card')].map((el) =>
    el.classList.contains('h-red') ? 'red'
    : el.classList.contains('h-blue') ? 'blue'
    : el.classList.contains('h-assassin') ? 'assassin' : 'neutral'),
);

// whichever team is up guesses all its own words (correct guesses keep the turn)
async function currentTeam() {
  const txt = await table.textContent('.cn-turn').catch(() => null);
  return txt?.includes('Red') ? 'red' : txt?.includes('Blue') ? 'blue' : null;
}
const team = await currentTeam();
if (!team) fail('no turn banner on table');
const targets = key.flatMap((k, i) => (k === team ? [i] : []));
for (const i of targets) {
  await operative.click(`.cn-card >> nth=${i}`);
  await operative.waitForFunction(
    (idx) => document.querySelectorAll('.cn-card')[idx].classList.contains('revealed'),
    i, { timeout: 8000 },
  );
}
await table.waitForSelector('.cn-over', { timeout: 10000 });
const overText = (await table.textContent('.cn-over')).trim();
if (!overText.toLowerCase().includes(team)) fail(`unexpected winner text: ${overText}`);
console.log(`ok: ${team} guessed all its words — "${overText}"`);
// after the game every card shows its color everywhere
await table.waitForFunction(() => document.querySelectorAll('.cn-card.hint, .cn-card.revealed').length === 25, null, { timeout: 5000 });
console.log('ok: full key revealed to everyone at game end');
await table.click('button:has-text("End game")');
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 5000 });

// ---------- Wildcards (2 players; others sit out) ----------
await table.click('button.game:has-text("Wildcards")');
await phones[2].waitForSelector('button:has-text("Sit out")', { timeout: 10000 });
await phones[2].click('button:has-text("Sit out")');
await phones[3].click('button:has-text("Sit out")');
await table.waitForSelector('button:has-text("Start Wildcards"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Wildcards")');
await table.waitForSelector('.wc-center', { timeout: 10000 });
console.log('ok: wildcards started with 2 players');

// the table shows piles only — no hand of cards
const tableCards = await table.locator('.wc-card').count();
if (tableCards > 2) fail(`table shows ${tableCards} cards — hands leaked?`);
if (await table.locator('.wc-hand').count()) fail('table renders a hand');
console.log('ok: table shows only the piles');

const players = [phones[0], phones[1]];
for (const p of players) await p.waitForSelector('.wc-hand', { timeout: 10000 });
const handSize = await players[0].locator('.wc-hand .wc-slot').count();
if (handSize !== 7) fail(`expected 7 starting cards, got ${handSize}`);
console.log('ok: player sees their 7 cards');

let done = false;
for (let i = 0; i < 400 && !done; i++) {
  if (await table.locator('.wc-over').count()) { done = true; break; }
  for (const p of players) {
    if (await p.locator('.wc-picker').count()) {
      await p.click('.wc-pick >> nth=0').catch(() => {});
      continue;
    }
    const keepBtn = p.locator('button:has-text("Keep it")');
    const playable = p.locator('.wc-slot.playable');
    if (await playable.count()) {
      await playable.first().click({ timeout: 1500 }).catch(() => {});
    } else if (await keepBtn.count()) {
      await keepBtn.click({ timeout: 1500 }).catch(() => {});
    } else {
      const draw = p.locator('button:has-text("Draw a card"):not([disabled])');
      if (await draw.count()) await draw.click({ timeout: 1500 }).catch(() => {});
    }
  }
  await table.waitForTimeout(250);
}
if (!done) fail('wildcards never finished within 400 rounds');
console.log(`ok: wildcards finished — "${(await table.textContent('.wc-over')).trim()}"`);
await table.click('button:has-text("End game")');
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 5000 });
console.log('ok: back to lobby');

await browser.close();
console.log('ALL CODENAMES+WILDCARDS TESTS PASSED');
