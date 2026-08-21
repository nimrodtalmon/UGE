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
}

const MAX_KEPT = 300;
const MAX_LEN = 2000;

export class FeedbackBook {
  private items: Feedback[] = [];

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
    } catch {
      /* read-only disk (hosted) — memory and GitHub carry it instead */
    }
    void fileIssue(item);
    return item;
  }

  list(): Feedback[] {
    return [...this.items].reverse(); // newest first
  }
}

/** Best-effort: open a GitHub issue so feedback outlives the container. */
async function fileIssue(item: Feedback): Promise<void> {
  const repo = process.env.UGE_FEEDBACK_REPO; // e.g. "nimrodtalmon/UGE"
  const token = process.env.UGE_FEEDBACK_TOKEN;
  if (!repo || !token) return;
  const where = [item.game ? `game: ${item.game}` : null, item.room ? `room: ${item.room}` : null]
    .filter(Boolean)
    .join(' · ');
  try {
    await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: `Feedback from ${item.from}: ${item.text.slice(0, 60)}`,
        body: `${item.text}\n\n---\n${where || 'from the lobby'}\nsent ${new Date(item.at).toISOString()}`,
        labels: ['feedback'],
      }),
    });
  } catch {
    /* offline or rejected — the entry is still in memory and on disk */
  }
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** A plain page so the feedback can be read from any browser. */
export function feedbackPage(items: Feedback[]): string {
  const rows = items
    .map(
      (f) => `<article>
      <header>${esc(f.from)}<span>${new Date(f.at).toLocaleString()}${f.game ? ` · ${esc(f.game)}` : ''}${f.room ? ` · room ${esc(f.room)}` : ''}</span></header>
      <p>${esc(f.text)}</p>
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
</style></head><body><main>
<h1>UGE feedback</h1>
${rows || '<p class="empty">Nothing yet.</p>'}
</main></body></html>`;
}
