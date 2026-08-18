// e2e test — needs a freshly started brain (UGE_NO_OPEN=1 npm run start:once) on :8000
// and a Chromium binary (default /opt/pw-browsers/chromium, override with UGE_CHROMIUM).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.UGE_CHROMIUM ?? '/opt/pw-browsers/chromium', headless: true });
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const table = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
table.on('pageerror', (e) => fail(`table pageerror: ${e.message}`));
const SETUP = { players: 2, phones: 2 };
await table.goto('http://localhost:8000/');
await table.evaluate(({ players, phones }) => fetch('/api/lobby/setup', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ players, phones }),
}), SETUP);
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

// ---------- Trivia ----------
await table.click('button.game:has-text("Trivia")');
await table.waitForSelector('button:has-text("Start Trivia"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Trivia")');
await table.waitForSelector('.tv-question', { timeout: 10000 });
console.log('ok: trivia started');

// correct answer must not be visible during the question phase
if (await table.locator('.tv-correct').count()) fail('correct answer visible before reveal');

// both phones answer every question (first choice); reveal auto-advances
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  if (await table.locator('.tv-over').count()) break;
  for (const p of phones) {
    const btn = p.locator('button.tv-choice:not([disabled])').first();
    if (await btn.count()) await btn.click().catch(() => {});
  }
  await table.waitForTimeout(400);
}
if (!(await table.locator('.tv-over').count())) fail('trivia never finished');
console.log(`ok: trivia ran to completion — "${(await table.textContent('.tv-over')).trim()}"`);
await table.click('button:has-text("End game")');
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 5000 });

// ---------- Alias ----------
await table.click('button.game:has-text("Alias")');
await table.waitForSelector('button:has-text("Start Alias"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Alias")');
await table.waitForSelector('.al-screen', { timeout: 10000 });
console.log('ok: alias started');

// find the explainer's phone and start the round from it
let explainer = null, guesser = null;
for (let t = 0; t < 40 && !explainer; t++) {
  for (const p of phones) {
    if (await p.locator('button:has-text("Start my round")').count()) {
      explainer = p;
      guesser = phones[phones.indexOf(p) ^ 1];
    }
  }
  if (!explainer) await table.waitForTimeout(300);
}
if (!explainer) fail('no phone offers "Start my round"');
await explainer.click('button:has-text("Start my round")');
await explainer.waitForSelector('.al-word', { timeout: 10000 });
console.log('ok: round started from explainer phone');

// privacy: the word shows ONLY on the explainer's phone
const word1 = (await explainer.textContent('.al-word')).trim();
if (!word1) fail('explainer sees empty word');
if (await guesser.locator('.al-word').count()) fail('guesser can see the word');
if (await table.locator('.al-word').count()) fail('table shows the word');
if ((await table.content()).includes(word1)) fail('word text leaked into table DOM');
console.log(`ok: word visible only to explainer`);

// got-it scores and advances the word; skip advances without scoring
await explainer.click('button:has-text("Got it")');
await explainer.waitForFunction(
  (w) => document.querySelector('.al-word')?.textContent?.trim() !== w, word1, { timeout: 5000 });
await explainer.waitForSelector('p:has-text("score this round: 1")', { timeout: 5000 });
const word2 = (await explainer.textContent('.al-word')).trim();
await explainer.click('button:has-text("Skip")');
await explainer.waitForFunction(
  (w) => document.querySelector('.al-word')?.textContent?.trim() !== w, word2, { timeout: 5000 });
await explainer.waitForSelector('p:has-text("score this round: 1")', { timeout: 3000 });
console.log('ok: got-it scores, skip advances without scoring');

// countdown is live on the table
const clock = parseInt((await table.textContent('.al-clock')).trim(), 10);
if (!(clock > 0 && clock <= 45)) fail(`table clock looks wrong: ${clock}`);
console.log(`ok: table countdown running (${clock}s left)`);

await table.click('button:has-text("End game")');
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 5000 });
console.log('ok: back to lobby');

await browser.close();
console.log('ALL TRIVIA+ALIAS TESTS PASSED');
