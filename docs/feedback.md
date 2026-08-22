# Gathering feedback from friends

The loop this is built for: hand out the UGE URL, let people send feedback
from inside the app whenever something annoys them, and come back now and
then to read it, act on it, and tick it off.

For that to work the feedback has to **outlive the server**. UGE on Render is
a free instance: it sleeps when idle, restarts on its own, and every deploy
wipes its disk. Anything kept only in the brain's memory or in
`feedback.jsonl` is gone by the next push. So the permanent home is **GitHub
issues** in your own repo.

```
friend taps 💬 in UGE  →  brain POSTs /api/feedback  →  GitHub issue, label "feedback"
                                                        ↓
                                            you (or Claude Code) read, fix, close
```

Closing the issue *is* deleting the feedback: it drops off the open list and
the history stays, so nothing is lost if you change your mind.

## One-time setup (about five minutes)

**1. Make a token.** GitHub → Settings → Developer settings → Personal access
tokens → *Fine-grained tokens* → Generate new token.

- Repository access: **Only select repositories** → `nimrodtalmon/UGE`
- Permissions → Repository permissions → **Issues: Read and write**
  (that is the only one it needs — no code access, no account access)
- Expiration: whatever you are comfortable with; UGE says so at boot when the
  token stops working, so an expiry is safe to set.

Copy the token — GitHub shows it once.

**2. Give it to Render.** Dashboard → your UGE service → **Environment** →
Add environment variable, twice:

| Key | Value |
|---|---|
| `UGE_FEEDBACK_REPO` | `nimrodtalmon/UGE` |
| `UGE_FEEDBACK_TOKEN` | the token you just copied |

Save. Render redeploys by itself.

**3. Check it took.** The brain tests the token once at boot and says so in
the Render logs:

```
UGE brain running (public mode).
  feedback: ok — filing issues on nimrodtalmon/UGE
```

Anything else names the problem — `token rejected`, `cannot see
nimrodtalmon/UGE — wrong name, or the token lacks access`. If the variables
are absent it warns that feedback is memory-only.

You can also send yourself a test message from the app and open
`/feedback`: each entry carries a green **filed as #12 ↗** link, or a red tag
saying why it isn't there.

## The review loop

Ask Claude Code to "go over the UGE feedback". It can, from here:

- read every open issue labelled `feedback`, with who sent it and from which
  game,
- group the reports, fix what is worth fixing, push,
- close each issue it dealt with, saying what changed.

Feedback nobody has acted on stays open, so the open list is the to-do list.

## Notes

- `/feedback` is unauthenticated — anyone with the URL can read what has been
  sent. Do not treat it as private, and tell friends the same. (The page only
  ever shows what this instance has in memory; the full history is on GitHub.)
- Locally (`npm start`) none of this is needed: feedback appends to
  `feedback.jsonl` next to the repo and stays there.
- The GitHub call is best-effort and never blocks the sender. If GitHub is
  down the entry still lands in memory and the page marks it as not filed.
