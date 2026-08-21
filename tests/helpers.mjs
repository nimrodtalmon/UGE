// Shared bits for the e2e suites. The lobby has no setup wizard: every device
// that opens UGE is a player, one of them volunteers as the table screen, and
// the group is whatever is connected.
import { chromium } from 'playwright-core';

export const BASE = 'http://localhost:8000';

export const launch = () =>
  chromium.launch({
    executablePath: process.env.UGE_CHROMIUM ?? '/opt/pw-browsers/chromium',
    headless: true,
  });

/**
 * Open a UGE client and wait for the home screen.
 * `path` '/' uses the host identity, '/join' (or a room path) a guest one.
 */
export async function openHome(browser, opts = {}) {
  const { path = '/', name, viewport = { width: 390, height: 844 }, onError, base = BASE } = opts;
  const ctx = await browser.newContext({ viewport });
  if (name) {
    const host = path === '/' || /^\/r\/[A-Z2-9]{4}$/.test(path);
    await ctx.addInitScript(
      ([n, keys]) => {
        localStorage.setItem(keys[0], n);
        localStorage.setItem(keys[1], '🦊');
      },
      [name, host ? ['uge:table-name', 'uge:table-avatar'] : ['uge:name', 'uge:avatar']],
    );
  }
  const page = await ctx.newPage();
  if (onError) page.on('pageerror', (e) => onError(e));
  await page.goto(base + path);
  await page.waitForSelector('h2:has-text("Pick a game")', { timeout: 15000 });
  return page;
}

/** Hand this screen the table role (it gives up its seat). */
export async function beTable(page) {
  await page.click('button:has-text("Add people")');
  await page.click('button:has-text("use as the table")');
  await page.waitForSelector('button:has-text("acting as the table")', { timeout: 8000 });
  await page.click('.room-close');
  await page.waitForSelector('.table-chip', { timeout: 8000 });
}

/** Say how many humans share this device (for pass-the-phone modes). */
export async function setSeats(page, n) {
  await page.click('button:has-text("Add people")');
  await page.waitForSelector('.room-inner .stepper', { timeout: 8000 });
  for (let i = 1; i < n; i++) await page.click('.room-inner .stepper button:has-text("+")');
  await page.waitForFunction(
    (want) => document.querySelector('.room-inner .stepper strong')?.textContent === String(want),
    n, { timeout: 8000 },
  );
  await page.click('.room-close');
}

export async function startGame(table, name) {
  // Start lives inside the game sheet, so the card has to be tapped every
  // time — a game left selected from an earlier round still has no sheet open.
  if (!(await table.locator('.sheet .big-start').count())) {
    await table.click(`button.game:has-text("${name}")`);
  }
  await table.waitForSelector(`button:has-text("Start ${name}"):not([disabled])`, { timeout: 10000 });
  await table.click(`button:has-text("Start ${name}")`);
}

export async function endGame(table) {
  await table.click('button:has-text("End game")');
  await table.waitForSelector('h2:has-text("Pick a game")', { timeout: 8000 });
}
