// e2e test — needs a freshly started brain (UGE_NO_OPEN=1 npm run start:once) on :8000
// and a Chromium binary (default /opt/pw-browsers/chromium, override with UGE_CHROMIUM).
import { launch, openHome, beTable, setSeats } from './helpers.mjs';

const browser = await launch();
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const table = await openHome(browser, { path: '/', name: 'Table', viewport: { width: 1440, height: 900 },
  onError: (e) => fail(`table pageerror: ${e.message}`) });
await beTable(table);

const phones = [];
for (const name of ['Nimrod', 'Dana']) {
  phones.push(await openHome(browser, { path: '/join', name,
    onError: (e) => fail(`${name} pageerror: ${e.message}`) }));
}

await table.click('button.game:has-text("Memory")');
// phones auto-join as players — start should enable without any claiming
await table.waitForSelector('button:has-text("Start Memory"):not([disabled])', { timeout: 10000 });
console.log('ok: auto-join enabled start without manual claims');
await table.click('button:has-text("Start Memory")');
await table.waitForSelector('.mem-grid', { timeout: 10000 });
await phones[0].waitForSelector('.mem-grid', { timeout: 10000 });
console.log('ok: memory started, grids on table and phones');

// the table is display-only
if (await table.locator('.mem-card:not([disabled])').count()) fail('table cards should be display-only');
console.log('ok: table board is display-only');

// anti-cheat: no face-down card exposes its face in the DOM
const leaked = await table.evaluate(() =>
  [...document.querySelectorAll('.mem-card.down .mem-front')].filter((el) => el.textContent.trim()).length,
);
if (leaked > 0) fail(`${leaked} face-down cards leak faces to the DOM`);
console.log('ok: face-down cards are masked in the DOM');

let first = null;
for (let t = 0; t < 60 && !first; t++) {
  for (const p of phones) if (await p.locator('.mem-turn.mine').count()) first = p;
  if (!first) await table.waitForTimeout(250);
}
if (!first) fail('no phone shows "your turn"');
const other = phones[phones.indexOf(first) ^ 1];
if (await other.locator('.mem-card.down:not([disabled])').count()) fail('non-current phone has enabled cards');
console.log('ok: turn indicator + non-current phone locked');

// play the whole game from the phones with a memory bot (server state is the truth)
const readFace = async (p, i) =>
  (await p.locator(`.mem-card >> nth=${i}`).locator('.mem-front').textContent()).trim();
async function serverPeek(p) {
  return p.evaluate(async () => {
    const id = localStorage.getItem('uge:device-id');
    const r = await fetch('/api/lobby/sync', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: id, name: 'peek', screen: { w: 1, h: 1 }, host: false }) });
    const s = (await r.json()).snapshot;
    const v = s.game?.view;
    return { current: v?.current, mismatch: v?.mismatch, states: v?.cards.map((c) => c.state[0]).join('') };
  });
}
async function flipV(p, i) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await p.click(`.mem-card >> nth=${i}`, { timeout: 2000 }).catch(() => {});
    for (let w = 0; w < 8; w++) {
      const s = await serverPeek(p);
      if (s.states[i] !== 'd') {
        await p.waitForFunction(
          (idx) => !document.querySelectorAll('.mem-card')[idx].classList.contains('down'),
          i, { timeout: 5000 },
        );
        return readFace(p, i);
      }
      await p.waitForTimeout(250);
    }
  }
  throw new Error(`flip ${i} failed`);
}

const known = new Map(); // card index -> face (down cards we have seen)
let matches = 0, mismatches = 0;
for (let turn = 0; turn < 80; turn++) {
  let s;
  for (let t = 0; ; t++) {
    s = await serverPeek(phones[0]);
    if (!s.mismatch && ![...s.states].includes('u')) break;
    if (t > 80) throw new Error('board never settled');
    await phones[0].waitForTimeout(250);
  }
  if (![...s.states].includes('d')) break; // every card matched — game over
  const p = phones[s.current]; // players joined in phone order, so seat == phone index

  for (const [i] of [...known]) if (s.states[i] !== 'd') known.delete(i); // drop stale info
  const downs = [...s.states].flatMap((c, i) => (c === 'd' ? [i] : []));
  const byFace = new Map();
  for (const [i, f] of known) byFace.set(f, [...(byFace.get(f) ?? []), i]);
  const pairIdx = [...byFace.values()].find((arr) => arr.length >= 2);

  let i1, i2;
  if (pairIdx) [i1, i2] = pairIdx;
  else i1 = downs.find((i) => !known.has(i)) ?? downs[0];

  const f1 = await flipV(p, i1);
  known.set(i1, f1);
  if (i2 === undefined) {
    const partner = [...known].find(([j, f]) => j !== i1 && f === f1)?.[0];
    i2 = partner ?? downs.find((j) => j !== i1 && !known.has(j)) ?? downs.find((j) => j !== i1);
  }
  const f2 = await flipV(p, i2);
  known.set(i2, f2);
  if (f1 === f2) matches++; else mismatches++;
}
await table.waitForSelector('.mem-over', { timeout: 15000 });
const overText = (await table.textContent('.mem-over')).trim();
console.log(`ok: game finished after ${matches} matches / ${mismatches} mismatches — "${overText}"`);

await phones[0].waitForSelector('.mem-confetti', { timeout: 5000 });
await table.click('button:has-text("Play again")');
await table.waitForFunction(() => document.querySelectorAll('.mem-card.matched').length === 0, null, { timeout: 8000 });
await table.click('button:has-text("End game")');
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 8000 });
console.log('ok: confetti, play again, back to lobby');

if (process.env.SCRATCH) await table.screenshot({ path: process.env.SCRATCH + '/memory-table.png' });
await browser.close();
console.log('ALL MEMORY TESTS PASSED');
