// e2e smoke test for the 8 new games — needs a freshly started brain
// (UGE_NO_OPEN=1 npm run start:once) on :8000.
// Block A: 2 players / 2 phones — backgammon, battleship, liarsdice, stop, yahtzee.
// Block B: 4 players / 4 phones — dial, hearts, werewolf.
import { launch, openHome, beTable, setSeats } from './helpers.mjs';

const browser = await launch();
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const table = await openHome(browser, { path: '/', name: 'Table', viewport: { width: 1600, height: 900 },
  onError: (e) => fail(`table pageerror: ${e.message}`) });
await beTable(table);

const phones = [];
async function addPhone(name) {
  const p = await openHome(browser, { path: '/join', name,
    onError: (e) => fail(`${name} pageerror: ${e.message}`) });
  phones.push(p);
}
await addPhone('Nimrod');
await addPhone('Dana');

async function start(name) {
  await table.click(`button.game:has-text("${name}")`);
  await table.waitForSelector(`button:has-text("Start ${name}"):not([disabled])`, { timeout: 10000 });
  await table.click(`button:has-text("Start ${name}")`);
}
async function endGame() {
  await table.click('button:has-text("End game")');
await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 8000 });
}
/** The phone (from a list) that currently shows `selector`. */
async function phoneWith(list, selector, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const p of list) if (await p.locator(selector).count()) return p;
    await new Promise((r) => setTimeout(r, 300));
  }
  fail(`no phone shows ${selector}`);
}

// ---------- Shesh-Besh (backgammon) ----------
await start('Shesh-Besh');
for (const p of phones) await p.waitForSelector('.bg-screen', { timeout: 10000 });
const roller = await phoneWith(phones, 'button.bg-roll:not([disabled])');
await roller.click('button.bg-roll');
await table.waitForSelector('.bg-die', { timeout: 8000 });
console.log('ok: shesh-besh — boards up, roll shows dice on the table');
await endGame();

// ---------- Battleship ----------
await start('Battleship');
for (const p of phones) {
  // wait for the GAME screen — 'Ready' alone also matches the lobby filter tab
  await p.waitForSelector('.bs-screen button:has-text("Ready")', { timeout: 10000 });
  if (!(await p.locator('.bs-cell.ship').count())) fail('phone does not see its own ships');
}
if (await table.locator('.bs-cell.ship').count()) fail('table sees un-hit ship cells');
for (const p of phones) await p.click('.bs-screen button:has-text("Ready")');
const shooter = await phoneWith(phones, '.bs-section:has(.bs-label:has-text("Target")) button.bs-cell:not([disabled])');
await shooter.click('.bs-section:has(.bs-label:has-text("Target")) button.bs-cell >> nth=44');
await shooter.waitForFunction(
  () => document.querySelectorAll('.bs-cell.hit, .bs-cell.miss, .bs-cell.sunk').length > 0,
  null, { timeout: 8000 },
);
await table.waitForFunction(
  () => document.querySelectorAll('.bs-cell.hit, .bs-cell.miss, .bs-cell.sunk').length > 0,
  null, { timeout: 8000 },
);
if (await table.locator('.bs-cell.ship').count()) fail('table leaked ships after the shot');
console.log('ok: battleship — ships private, shot lands on phone and table');
await endGame();

// ---------- Liar's Dice ----------
await start("Liar's Dice");
const bidder = await phoneWith(phones, '.ld-do-bid');
if ((await bidder.locator('.ld-die.big.mine').count()) !== 5) fail('bidder does not see 5 own dice');
const other = phones.find((p) => p !== bidder);
await other.waitForSelector('.ld-screen', { timeout: 8000 });
if (await other.locator('.ld-die.big.mine').count() !== 5) fail('other player missing own dice');
await bidder.click('.ld-do-bid');
await other.waitForSelector('.ld-dudo', { timeout: 8000 });
console.log("ok: liar's dice — own dice private, bid passes the turn");
await endGame();

// ---------- Stop! ----------
await start('Stop!');
await table.waitForSelector('.st2-letter', { timeout: 10000 });
await phones[0].waitForSelector('.st2-input', { timeout: 10000 });
if ((await phones[0].locator('.st2-input').count()) !== 5) fail('expected 5 category inputs');
await phones[0].fill('.st2-input >> nth=0', 'test');
if (await phones[0].locator('button.st2-stop:not([disabled])').count()) {
  fail('STOP enabled with only 1/5 answers');
}
console.log('ok: stop! — letter up, 5 inputs, STOP gated on a full sheet');
await endGame();

// ---------- Yatze (yahtzee) ----------
await start('Yatze');
const yzRoller = await phoneWith(phones, 'button.yz-roll:not([disabled])');
await yzRoller.click('button.yz-roll');
await table.waitForFunction(
  () => [...document.querySelectorAll('.yz-die')].filter((el) => !el.className.includes('blank')).length >= 5,
  null, { timeout: 8000 },
);
console.log('ok: yatze — roll shows five dice on the table');
await endGame();

// ---------- Block B: 4 players / 4 phones ----------
await addPhone('Ben');
await addPhone('Noa');

// ---------- Dial ----------
await start('Dial');
const psychic = await phoneWith(phones, 'button:has-text("psychic")');
await psychic.click('button:has-text("psychic")');
await psychic.waitForSelector('.dl-psychic', { timeout: 8000 });
const guessers = phones.filter((p) => p !== psychic);
await guessers[0].waitForSelector('.dl-screen', { timeout: 8000 });
if (await guessers[0].locator('.dl-psychic').count()) fail('non-psychic sees the target card');
await psychic.click('.dl-go');
const dialer = await phoneWith(guessers, '.dl-lock');
await dialer.click('.dl-lock');
await table.waitForFunction(
  () => document.body.textContent.includes('🎯'),
  null, { timeout: 8000 },
);
console.log('ok: dial — target psychic-only, clue → guess → reveal');
await endGame();

// ---------- Hearts ----------
await start('Hearts');
for (const p of phones) {
  await p.waitForSelector('.ht-hand', { timeout: 10000 });
  if ((await p.locator('.ht-hand .ht-slot').count()) !== 13) fail('expected 13 cards in hand');
}
if (await table.locator('.ht-hand').count()) fail('table shows a hand');
for (const p of phones) {
  for (let i = 0; i < 3; i++) await p.click(`.ht-hand .ht-slot >> nth=${i}`);
  await p.click('.ht-pass-btn');
}
await table.waitForSelector('.ht-trickring', { timeout: 10000 });
const leader = await phoneWith(phones, '.ht-hand .ht-slot.playable');
await leader.click('.ht-hand .ht-slot.playable >> nth=0');
await table.waitForSelector('.ht-trickcard', { timeout: 8000 });
console.log('ok: hearts — 13 cards each, pass done, 2♣ opens the first trick');
await endGame();

// ---------- Werewolf ----------
await start('Werewolf');
let wolves = 0;
for (const p of phones) {
  await p.waitForSelector('.ww-role-title', { timeout: 10000 });
  const role = (await p.textContent('.ww-role-title')).toLowerCase();
  if (role.includes('wolf')) wolves++;
}
if (wolves !== 1) fail(`expected exactly 1 wolf among 4 players, saw ${wolves}`);
if (await table.locator('.ww-role-title').count()) fail('table shows a role');
for (const p of phones) await p.click('.ww-screen button:has-text("Ready")');
await table.waitForSelector('.ww-banner:has-text("sleeps")', { timeout: 10000 });
console.log('ok: werewolf — roles private (1 wolf), all ready, night falls');
await endGame();

await browser.close();
console.log('ALL MORE-GAMES TESTS PASSED');
