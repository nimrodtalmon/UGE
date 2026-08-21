// e2e test for room management — needs a freshly started brain on :8000.
// Removing someone from the room, and sending feedback from inside UGE.
import { launch, openHome } from './helpers.mjs';

const browser = await launch();
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const host = await openHome(browser, {
  path: '/',
  name: 'Nimrod',
  viewport: { width: 1000, height: 860 },
  onError: (e) => fail(`host pageerror: ${e.message}`),
});
const guest = await openHome(browser, {
  path: '/join',
  name: 'Dana',
  onError: (e) => fail(`guest pageerror: ${e.message}`),
});
await host.waitForSelector('.tile:has-text("Dana")', { timeout: 10000 });
console.log('ok: two devices in the room');

// ---------- kick ----------
await host.click('.person:has-text("Dana")');
await host.waitForSelector('.sheet:has-text("Dana")', { timeout: 5000 });
await host.click('button:has-text("Remove from the room")');
await host.waitForFunction(
  () => ![...document.querySelectorAll('.person .who')].some((e) => e.textContent === 'Dana'),
  null, { timeout: 8000 },
);
console.log('ok: removed player disappears from the room');

// the removed device is told, and is not silently re-added
await guest.waitForSelector('button:has-text("Join again")', { timeout: 10000 });
await host.waitForTimeout(2500);
if (await host.locator('.person:has-text("Dana")').count()) fail('kicked device crept back in');
console.log('ok: the removed device sees why, and stays out');

// ...and can come back deliberately
await guest.click('button:has-text("Join again")');
await host.waitForSelector('.tile:has-text("Dana")', { timeout: 10000 });
console.log('ok: they can rejoin on purpose');

// ---------- feedback ----------
await host.click('button:has-text("Add people")');
await host.waitForSelector('.feedback-link', { timeout: 5000 });
await host.click('.feedback-link');
await host.waitForSelector('.feedback-text', { timeout: 5000 });
await host.fill('.feedback-text', 'the dice are too small on my phone');
await host.click('button:has-text("Send feedback")');
await host.waitForSelector('.ok-note', { timeout: 5000 });

const stored = await host.evaluate(async () => (await fetch('/api/feedback')).json());
if (!stored.some((f) => f.text.includes('dice are too small') && f.from === 'Nimrod')) {
  fail(`feedback not stored: ${JSON.stringify(stored)}`);
}
const page = await (await fetch('http://localhost:8000/feedback')).text();
if (!page.includes('dice are too small')) fail('feedback page does not show the entry');
console.log('ok: feedback sent, stored, and readable at /feedback');

await browser.close();
console.log('ALL ROOM-ADMIN TESTS PASSED');
