import fs from 'node:fs';
import path from 'node:path';

/**
 * In-app feedback. Kept in memory so it can always be read back at /feedback,
 * appended to feedback.jsonl when the disk is writable (a local brain), and
 * filed as a GitHub issue when UGE_FEEDBACK_REPO + UGE_FEEDBACK_TOKEN are set
 * (a hosted brain, whose disk does not survive a deploy).
 */

export interface Feedback {
  at: number;
  from: string;
  room: string;
  game: string | null;
  text: string;
  /** Where it ended up on GitHub, once filed. */
  issue?: { number: number; url: string };
  /** Why it did not get there, if it didn't. */
  issueError?: string;
}

const MAX_KEPT = 300;
const MAX_LEN = 2000;

export class FeedbackBook {
  private items: Feedback[] = [];
  /** True once an append to the file has actually worked. */
  private onDisk = false;

  constructor(private readonly file: string) {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      this.items = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Feedback)
        .slice(-MAX_KEPT);
    } catch {
      /* no file yet, or unreadable — memory only */
    }
  }

  add(input: { from?: unknown; room?: unknown; game?: unknown; text?: unknown }): Feedback | null {
    const text = typeof input.text === 'string' ? input.text.trim().slice(0, MAX_LEN) : '';
    if (!text) return null;
    const item: Feedback = {
      at: Date.now(),
      from: typeof input.from === 'string' ? input.from.slice(0, 40) : 'someone',
      room: typeof input.room === 'string' ? input.room.slice(0, 8) : '',
      game: typeof input.game === 'string' ? input.game.slice(0, 40) : null,
      text,
    };
    this.items.push(item);
    if (this.items.length > MAX_KEPT) this.items = this.items.slice(-MAX_KEPT);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${JSON.stringify(item)}\n`);
      this.onDisk = true;
    } catch {
      /* read-only disk (hosted) — memory and GitHub carry it instead */
    }
    void fileIssue(item).then((result) => {
      // the entry is already in the list; annotate it in place so /feedback
      // can show a link, or say why there isn't one
      if ('url' in result) item.issue = result;
      else if (result.error) item.issueError = result.error;
    });
    return item;
  }

  list(): Feedback[] {
    return [...this.items].reverse(); // newest first
  }

  /**
   * Where a new entry would actually survive to. On a hosted brain the disk is
   * wiped by every deploy and the process restarts on its own, so without the
   * GitHub env vars feedback lives only until the next push — which is exactly
   * how a real report got lost. Say so instead of pretending it is filed.
   */
  durability(): { github: boolean; disk: boolean; volatile: boolean } {
    const github = Boolean(process.env.UGE_FEEDBACK_REPO && process.env.UGE_FEEDBACK_TOKEN);
    return { github, disk: this.onDisk, volatile: !github };
  }
}

/** Best-effort: open a GitHub issue so feedback outlives the container. */
async function fileIssue(
  item: Feedback,
): Promise<{ number: number; url: string } | { error: string | null }> {
  const repo = process.env.UGE_FEEDBACK_REPO; // e.g. "nimrodtalmon/UGE"
  const token = process.env.UGE_FEEDBACK_TOKEN;
  if (!repo || !token) return { error: null }; // not configured; not an error
  const where = [item.game ? `game: ${item.game}` : null, item.room ? `room: ${item.room}` : null]
    .filter(Boolean)
    .join(' · ');
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'uge-feedback',
      },
      body: JSON.stringify({
        title: `${item.game ? `[${item.game}] ` : ''}${item.text.slice(0, 60)}${item.text.length > 60 ? '…' : ''}`,
        body: `${item.text}\n\n---\nfrom **${item.from}**${where ? ` · ${where}` : ''}\nsent ${new Date(item.at).toISOString()}`,
        labels: ['feedback'],
      }),
    });
    if (!r.ok) {
      const detail = r.status === 401 || r.status === 403 ? 'token rejected' : `HTTP ${r.status}`;
      console.warn(`feedback: GitHub refused the issue (${detail})`);
      return { error: detail };
    }
    const issue = (await r.json()) as { number: number; html_url: string };
    return { number: issue.number, url: issue.html_url };
  } catch (err) {
    const detail = String(err).split('\n')[0]!.slice(0, 80);
    console.warn(`feedback: could not reach GitHub (${detail})`);
    return { error: detail };
  }
}

/**
 * One call at boot so a wrong token or repo is caught immediately, rather than
 * silently swallowing every report until someone comes looking for them.
 */
export async function checkFeedbackTarget(): Promise<string> {
  const repo = process.env.UGE_FEEDBACK_REPO;
  const token = process.env.UGE_FEEDBACK_TOKEN;
  if (!repo || !token) return 'not configured';
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'uge-feedback',
      },
    });
    if (r.status === 404) return `cannot see ${repo} — wrong name, or the token lacks access`;
    if (r.status === 401 || r.status === 403) return `${repo}: token rejected`;
    if (!r.ok) return `${repo}: HTTP ${r.status}`;
    return `ok — filing issues on ${repo}`;
  } catch (err) {
    return `could not reach GitHub (${String(err).split('\n')[0]!.slice(0, 60)})`;
  }
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** A plain page so the feedback can be read from any browser. */
export function feedbackPage(
  items: Feedback[],
  durability: { github: boolean; disk: boolean; volatile: boolean } = {
    github: false, disk: false, volatile: false,
  },
): string {
  const rows = items
    .map(
      (f) => `<article>
      <header>${esc(f.from)}<span>${new Date(f.at).toLocaleString()}${f.game ? ` · ${esc(f.game)}` : ''}${f.room ? ` · room ${esc(f.room)}` : ''}</span></header>
      <p>${esc(f.text)}</p>
      ${
        f.issue
          ? `<a class="tag ok" href="${esc(f.issue.url)}">filed as #${f.issue.number} ↗</a>`
          : f.issueError
            ? `<span class="tag bad">not filed on GitHub — ${esc(f.issueError)}</span>`
            : ''
      }
    </article>`,
    )
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>UGE — feedback</title>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
<style>
  body { background:#0e1014; color:#f1f3f7; font-family:system-ui,sans-serif; margin:0; padding:2rem 1rem; }
  main { max-width:44rem; margin:0 auto; display:flex; flex-direction:column; gap:0.9rem; }
  h1 { font-size:1.3rem; letter-spacing:0.14em; }
  article { background:#171a21; border:1px solid #272c36; border-radius:16px; padding:0.9rem 1rem; }
  header { display:flex; justify-content:space-between; gap:1rem; font-weight:700; margin-bottom:0.4rem; }
  header span { font-weight:400; color:#8b93a3; font-size:0.82rem; text-align:right; }
  p { margin:0; white-space:pre-wrap; line-height:1.45; }
  .empty { color:#8b93a3; }
  .warn { background:#3a2c15; border:1px solid #7a5a20; color:#f0d9a8; border-radius:12px;
          padding:0.7rem 0.9rem; margin:0; line-height:1.45; }
  .ok { color:#8fd6a6; margin:0; }
  code { background:#0b0d11; padding:0.05rem 0.3rem; border-radius:5px; }
  .tag { display:inline-block; margin-top:0.5rem; font-size:0.78rem; border-radius:999px;
         padding:0.15rem 0.6rem; text-decoration:none; }
  .tag.ok { background:#1d3b28; color:#8fd6a6; border:1px solid #2f6f47; }
  .tag.bad { background:#3b1d1d; color:#e9a8a8; border:1px solid #6f2f2f; }
  button { align-self:flex-start; background:#2f6f47; color:#fff; border:1px solid #4b8f63;
           border-radius:999px; padding:0.45rem 1rem; font:inherit; font-weight:700; cursor:pointer; }
</style></head><body><main>
<h1>UGE feedback</h1>
${
  durability.volatile
    ? `<p class="warn">⚠ This brain keeps feedback in memory${durability.disk ? ' and on a disk that a deploy wipes' : ' only'} —
       it is lost on the next deploy or restart. Set <code>UGE_FEEDBACK_REPO</code> and
       <code>UGE_FEEDBACK_TOKEN</code> to file each entry as a GitHub issue. Until then, copy it out.</p>`
    : '<p class="ok">✓ Each entry is also filed as a GitHub issue.</p>'
}
${items.length > 0 ? '<button id="copy">Copy all</button>' : ''}
${rows || '<p class="empty">Nothing yet.</p>'}
</main>
<script>
  const btn = document.getElementById('copy');
  if (btn) btn.addEventListener('click', async () => {
    const text = [...document.querySelectorAll('article')]
      .map((a) => a.querySelector('header').innerText + '\n' + a.querySelector('p').innerText)
      .join('\n\n---\n\n');
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied ✓'; }
    catch { btn.textContent = 'Select the text below and copy it'; }
  });
</script>
</body></html>`;
}
