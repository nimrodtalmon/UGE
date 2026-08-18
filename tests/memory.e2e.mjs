// e2e test — needs a freshly started brain (UGE_NO_OPEN=1 npm run start:once) on :8000
// and a Chromium binary (default /opt/pw-browsers/chromium, override with UGE_CHROMIUM).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.UGE_CHROMIUM ?? '/opt/pw-browsers/chromium', headless: true });
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const tableCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const table = await tableCtx.newPage();
table.on('pageerror', (e) => fail(`table pageerror: ${e.message}`));
await table.goto('http://localhost:8000/');

const phones = [];
for (const name of ['Nimrod', 'Dana']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fail(`${name} pageerror: ${e.message}`));
  await p.goto('http://localhost:8000/join');
  await p.fill('input', name);
  await p.click('button:has-text("Join the lobby")');
  phones.push(p);
}

await table.click('button.game:has-text("Memory")');
for (const p of phones) {
  await p.waitForSelector('button:has-text("Join as player")', { timeout: 10000 });
  await p.click('button:has-text("Join as player")');
}
await table.waitForSelector('button:has-text("Start Memory"):not([disabled])', { timeout: 10000 });
await table.click('button:has-text("Start Memory")');
await table.waitForSelector('.mem-grid', { timeout: 10000 });
await phones[0].waitForSelector('.mem-grid', { timeout: 10000 });
console.log('ok: memory started, grids on table and phones');

// anti-cheat: no face-down card exposes its face in the DOM
const leaked = await table.evaluate(() =>
  [...document.querySelectorAll('.mem-card.down .mem-front')].filter((el) => el.textContent.trim()).length,
);
if (leaked > 0) fail(`${leaked} face-down cards leak faces to the DOM`);
console.log('ok: face-down cards are masked in the DOM');

// phone turn indicators
await phones[0].waitForSelector('.mem-turn.mine', { timeout: 5000 });
if (await phones[1].locator('.mem-turn.mine').count()) fail('both phones think it is their turn');
console.log('ok: turn indicator on the right phone');

// wrong phone cannot flip (buttons disabled)
if (await phones[1].locator('.mem-card.down:not([disabled])').count()) fail('non-current phone has enabled cards');
console.log('ok: non-current phone cards disabled');

// play the whole game from the table with a memory bot
const known = new Map(); // face -> Set of indices (unmatched, known)
const readFace = async (i) =>
  (await table.locator(`.mem-card >> nth=${i}`).locator('.mem-front').textContent()).trim();
const cardCount = await table.locator('.mem-card').count();

async function waitSettled() {
  await table.waitForFunction(() => document.querySelectorAll('.mem-card.up').length === 0, null, { timeout: 8000 });
}
async function flipAndRead(i) {
  await table.click(`.mem-card >> nth=${i}`);
  await table.waitForFunction(
    (idx) => !document.querySelectorAll('.mem-card')[idx].classList.contains('down'),
    i, { timeout: 8000 },
  );
  return readFace(i);
}
const isMatched = async (i) =>
  (await table.locator(`.mem-card >> nth=${i}`).getAttribute('class')).includes('matched');
async function unknownIndices() {
  const knownIdx = new Set([...known.values()].flatMap((s) => [...s]));
  const out = [];
  for (let i = 0; i < cardCount; i++) {
    if (!knownIdx.has(i) && !(await isMatched(i))) out.push(i);
  }
  return out;
}

let matches = 0, mismatches = 0;
for (let turn = 0; turn < 60; turn++) {
  if (await table.locator('.mem-over').count()) break;
  await waitSettled();
  if (await table.locator('.mem-over').count()) break;

  let i1, i2;
  const pair = [...known.entries()].find(([, s]) => s.size === 2);
  if (pair) {
    [i1, i2] = [...pair[1]];
  } else {
    const unknowns = await unknownIndices();
    i1 = unknowns[0];
  }
  const f1 = await flipAndRead(i1);
  if (!known.has(f1)) known.set(f1, new Set());
  known.get(f1).add(i1);

  if (i2 === undefined) {
    const partner = [...(known.get(f1) ?? [])].find((j) => j !== i1);
    i2 = partner ?? (await unknownIndices()).find((j) => j !== i1);
  }
  const f2 = await flipAndRead(i2);
  if (!known.has(f2)) known.set(f2, new Set());
  known.get(f2).add(i2);

  if (f1 === f2) {
    known.delete(f1);
    matches++;
  } else {
    mismatches++;
  }
}
await table.waitForSelector('.mem-over', { timeout: 15000 });
const overText = (await table.textContent('.mem-over')).trim();
console.log(`ok: game finished after ${matches} matches / ${mismatches} mismatches — "${overText}"`);

// confetti + phone sees the result too
await phones[0].waitForSelector('.mem-confetti', { timeout: 5000 });
console.log('ok: confetti on phone');

// play again from the table overlay
await table.click('button:has-text("Play again")');
await table.waitForFunction(() => document.querySelectorAll('.mem-card.matched').length === 0, null, { timeout: 8000 });
console.log('ok: play again resets the board');
await table.click('button:has-text("End game")');
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 5000 });
console.log('ok: back to lobby');

if (process.env.SCRATCH) await table.screenshot({ path: process.env.SCRATCH + '/memory-table.png' });
await browser.close();
console.log('ALL MEMORY TESTS PASSED');
