import { FeedbackBook, checkFeedbackTarget } from '../src/server/feedback.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// a fresh file per run: add() creates the directory and appends, so a fixed
// path means the second run reads back the first run's entries
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uge-fb-'));
const store = path.join(dir, 'feedback.jsonl');
const fail = (m: string) => { console.error('FAIL:', m); process.exit(1) };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const calls: { url: string; init: RequestInit }[] = [];
let reply: () => Response;
globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
  calls.push({ url: String(url), init });
  return reply();
}) as never;

process.env['UGE_FEEDBACK_REPO'] = 'nimrodtalmon/UGE';
process.env['UGE_FEEDBACK_TOKEN'] = 'tok';

// --- happy path: an entry becomes an issue and the page links to it
reply = () => new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/x/7' }), { status: 201 });
const book = new FeedbackBook(store);
const item = book.add({ from: 'Nimrod', text: 'chess AI too easy on hard', game: 'Chess', room: 'PXCB' });
if (!item) fail('add returned null');
await sleep(20);
const posted = calls.find((c) => c.url.endsWith('/issues'));
if (!posted) fail('no issue POST');
const body = JSON.parse(String(posted!.init.body));
if (!body.title.includes('Chess')) fail(`title lost the game: ${body.title}`);
if (!body.body.includes('chess AI too easy')) fail('body lost the text');
if (!body.body.includes('Nimrod')) fail('body lost the author');
if (!body.labels.includes('feedback')) fail('missing the feedback label');
if ((posted!.init.headers as Record<string,string>)['authorization'] !== 'Bearer tok') fail('token not sent');
if (book.list()[0]!.issue?.number !== 7) fail('issue number not recorded on the entry');
if (book.durability().volatile) fail('should not be volatile once GitHub is configured');
console.log(`ok: filed as issue #${book.list()[0]!.issue!.number}, title "${body.title}"`);

// --- a rejected token must be visible, not swallowed
reply = () => new Response('{"message":"Bad credentials"}', { status: 401 });
book.add({ from: 'Ann', text: 'ludo board too small' });
await sleep(20);
const bad = book.list().find((f) => f.text.includes('ludo'))!;
if (bad.issueError !== 'token rejected') fail(`error not recorded: ${String(bad.issueError)}`);
console.log(`ok: a 401 is recorded on the entry as "${bad.issueError}"`);

// --- GitHub being down must not lose the entry
reply = () => { throw new Error('ECONNREFUSED api.github.com'); };
book.add({ from: 'Bob', text: 'sudoku pencil marks' });
await sleep(20);
const down = book.list().find((f) => f.text.includes('sudoku'))!;
if (!down.issueError) fail('outage not recorded');
if (book.list().length !== 3) fail('an entry was lost');
console.log(`ok: an outage keeps the entry ("${down.issueError.slice(0, 30)}")`);

// --- the boot check names the problem
reply = () => new Response('{}', { status: 404 });
const s404 = await checkFeedbackTarget();
if (!s404.includes('wrong name')) fail(`404 not explained: ${s404}`);
reply = () => new Response('{}', { status: 401 });
const s401 = await checkFeedbackTarget();
if (!s401.includes('rejected')) fail(`401 not explained: ${s401}`);
reply = () => new Response('{}', { status: 200 });
const sOk = await checkFeedbackTarget();
if (!sOk.startsWith('ok')) fail(`200 not accepted: ${sOk}`);
console.log(`ok: boot check says "${s404}" / "${s401}" / "${sOk}"`);

// --- unconfigured is not an error
delete process.env['UGE_FEEDBACK_TOKEN'];
if ((await checkFeedbackTarget()) !== 'not configured') fail('missing token should read as unconfigured');
if (!new FeedbackBook(path.join(dir, 'other.jsonl')).durability().volatile) fail('should be volatile with no token');
console.log('ok: no token reads as "not configured", and volatile');
// the entries really did reach the disk, and come back on a restart
const reloaded = new FeedbackBook(store).list();
if (reloaded.length !== 3) fail(`reload lost entries: ${reloaded.length} of 3`);
console.log('ok: a restart reads the three entries back off disk');
fs.rmSync(dir, { recursive: true, force: true });
console.log('ALL FEEDBACK TESTS PASSED');
