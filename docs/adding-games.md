# Adding a game

A game is one folder under `games/<id>/` — the platform discovers it at
startup by scanning for `manifest.json`. No registration, no platform edits.
(Practical loop: ask Claude Code to write one in this repo, push, then hit
**Update** on the table screen — or write it by hand.)

```
games/<id>/
├── manifest.json     # metadata (below)
├── game.ts           # rules: pure functions over plain state
├── bot.ts            # optional: an AI opponent (below)
├── views/            # one React component per role: table.tsx, hand.tsx, ...
│   └── style.css     # optional, imported by the views
└── assets/           # optional data: word lists, questions, images
```

## manifest.json

```json
{
  "id": "mygame",                       // must equal the folder name
  "name": "My Game",
  "icon": "🎯",                          // lobby box emoji (optional)
  "tagline": "one-liner for the lobby", // optional
  "players": { "min": 2, "max": 6 },   // humans, not devices
  "phones": { "min": 2 },              // optional: min client devices, when fewer
                                       // than one per player works (see below)
  "help": { "goal": "...", "steps": ["..."] },  // required in practice — see below
  "bots": { "levels": [] },            // optional: AI opponents — see below
  "roles": {
    "table": "required",                // required | optional | none
    "hand": "per-player",               // per-player | per-team | none
    "extras": []       // extra claimable roles, e.g. ["spymaster-red"] — each
                       // must be claimed before the game can start, and gets
                       // its own view file (views/spymaster-red.tsx)
  }
}
```

A manifest-only folder shows up in the lobby as "not playable yet" — useful
for stubbing.

Nothing is declared up front: the lobby derives the group from who is
connected — one device is one player unless it says "N of us here", and any
device may volunteer as the table screen. Games are matched against that
live group, so the list reshapes itself as people join.

Phone need defaults to one per player (when `hand` is per-player) plus one
per extra role; set `phones.min` when devices can be shared (Codenames: one
spymasters device + one shared guessing phone → 2). `players` counts HUMANS,
`phones` counts devices, and the table screen is separate — keep the three
apart when declaring requirements.

Current audit of the built-in games (players × phones). Every built-in game
declares the table screen **optional** — phones carry all the info needed to
play, the table just makes it nicer — so groups without a spare screen can
still play everything. A ✓ in the AI column means the game ships a `bot.ts`,
so it can fill empty seats and be played alone (21 of 37 do):

| Game | Mode | Players | Phones | AI |
|---|---|---|---|---|
| 2048 | — | 1 | per player |  |
| Alias | teams — pass the phone / party — phone each | 2–12 | 1 / per player |  |
| Battleship | — | 2 | per player | ✓ |
| Blackjack | short game / endless | 1–6 | per player | ✓ |
| Boggle | classic / quick / long / big | 1–8 | per player |  |
| Checkers | — | 2 | per player | ✓ |
| Chess | phone each / one shared phone | 2 | per player / 1 | ✓ |
| Codenames | map + phones / one shared phone | 4–9 | 2 / 1 |  |
| Connect Four | — | 2 | per player | ✓ |
| Dial | — | 4–12 | 1 |  |
| Dominoes | — | 2–4 | per player | ✓ |
| Dots & Boxes | classic / small / big | 2 | per player | ✓ |
| Go Fish | — | 2–6 | per player | ✓ |
| Hearts | — | 4 | per player | ✓ |
| Hotel Empire | relaxed / tycoon | 1 | per player |  |
| Liar's Dice | — | 2–6 | per player | ✓ |
| Lights Out | — | 1 | per player |  |
| Little Farm | chill / one season | 1 | per player |  |
| Ludo | quick / classic | 2–4 | per player | ✓ |
| Mancala | — | 2 | per player | ✓ |
| Memory | phone each / pass the phone | 2–6 | per player / 1 | ✓ |
| Minesweeper | easy / medium / hard | 1 | per player |  |
| Poker | — | 2–8 | per player | ✓ |
| Reversi | — | 2 | per player | ✓ |
| Rummikub | — | 2–4 | per player |  |
| Set | classic / sprint | 1–8 | per player | ✓ |
| Shesh-Besh | phone each / one phone | 2 | per player / 1 | ✓ |
| Sketch | — | 2–8 | per player |  |
| Solitaire | — | 1 | per player |  |
| Stop! | — | 2–8 | per player |  |
| Sudoku | easy / medium / hard | 1 | per player |  |
| Tiny City | sandbox / mayor | 1 | per player |  |
| Trivia | classic / quick | 1–8 | per player | ✓ |
| UNO | phone each / one shared phone | 2–8 | per player / 1 | ✓ |
| Werewolf | — | 4–12 | per player |  |
| Word Hunt | solo / race | 1–6 | per player | ✓ |
| Yatze | phone each / pass the phone | 1–8 | per player / 1 | ✓ |

## Modes — several ways to play one game

A game may declare `modes`: variants with their own player/phone needs and
settings. The lobby shows a mode picker, auto-selects the first mode that
fits the declared group, and a game is listed as fitting if ANY mode fits.
The chosen mode reaches `setup(ctx)` as `ctx.mode = { id, config }`, and
`ctx.group` carries the declared group (useful for virtual seats).

```json
"modes": [
  { "id": "phones", "name": "Phone each", "tagline": "private hands" },
  { "id": "pass", "name": "Pass the phone", "tagline": "one shared device",
    "phones": { "min": 1 }, "config": { "pass": true } }
]
```

`config` is opaque to the platform — branch on it in `setup`. Patterns used
by the built-in games: virtual seats named "Player N" sized from
`ctx.group.players` (Memory/UNO pass modes), a lock-between-turns flag for
hidden-hand hotseat (UNO's `takePhone` move), and letting an extra role act
(Codenames one-phone mode: the map device may `guess`).

## help — how to play, in the game's own words

Every game declares a `help` block. The lobby shows it inside the game sheet
and the `?` chip shows it mid-game, so a player who has never seen your game
can start it without asking anyone.

```json
"help": {
  "goal": "One sentence: what winning looks like.",
  "steps": ["Tap a square.", "It flips, and so do its neighbours.", "..."],
  "notes": ["House rules, simplifications, anything surprising."]
}
```

Write `steps` as things to *do*, in the order a player meets them, naming the
buttons as they are actually labelled. Put every rule you simplified in
`notes` — Blackjack lists "no insurance, no surrender" there. Help is not
optional: all 37 built-in games have it.

## bot.ts — an AI that fills empty seats

Declare difficulty levels in the manifest and the lobby offers "play against
the computer", pre-ticked when a game needs more players than are in the
room. Bots hold a seat but no phone, so one person alone can play Chess.

```json
"bots": { "levels": [
  { "id": "easy",   "name": "Easy",   "tagline": "plays the first legal move" },
  { "id": "normal", "name": "Normal", "tagline": "looks one move ahead" },
  { "id": "sharp",  "name": "Sharp",  "tagline": "searches deeper" }
] }
```

Then add `bot` to your `GameDef`:

```ts
bot(state, { seat, playerId, level, players, random, now }) {
  // return { name: 'myMove', args: [...] }, or null when it is not your turn
}
```

- It must return a **legal** move, and must never return `null` while the
  game is unfinished and it is the bot's turn — that deadlocks the room.
- Same purity rules: `random` and `now` come from the context, never the
  globals.
- Give it only what a player would know. If the engine hands you full state,
  derive the bot's decision from the public parts yourself — Go Fish plays
  off the public ask log, and its test scrambles the hidden hands to prove it.
- Keep it fast; it runs inside a poll. Dots & Boxes searches a 9×9 board in
  ~10 ms.
- The platform delays the reply by ~0.9 s so it reads as a person thinking.
- Levels must actually differ. Measure it: play the levels against each other
  a few hundred times and check the stronger one wins more.

Shared "pass the phone" modes are hidden whenever a bot is in the game — no
one wants to hand a phone to the computer.

## game.ts — the rules

Default-export a `GameDef` (types in `src/shared/plugin.ts`). Everything is
pure functions over JSON-able state; the platform owns sync, turns UI, and
timers on the client side.

```ts
import type { GameDef } from '../../src/shared/plugin.js';

const game: GameDef<MyState, MyView> = {
  setup({ players, random, now }) { /* build initial state */ },
  moves: {
    myMove(state, ctx, ...args) { /* return the next state (or `state` to reject) */ },
  },
  playerView(state, { playerId, role, players }) {
    /* filter secrets per device — anything you return reaches that browser */
  },
  isOver(state) { /* return { text } when finished, else null */ },
};
export default game;
```

Rules of the road:
- Moves return **new** state (or the same object to reject). No mutation.
- Never call `Date.now()` / `Math.random()` — use `ctx.now` / `ctx.random`
  so games stay deterministic and clock-consistent.
- `ctx.role === 'table'` marks moves sent by the table screen. The table is
  display-only for gameplay, but it drives *timer* moves (round ends,
  reveals) — make those idempotent and guard them with `ctx.now`.
- Secrets (hidden cards, key words) must be stripped in `playerView` —
  whatever you return is visible in that device's browser devtools.
- Assets: import JSON with `import words from './assets/words.json' with { type: 'json' }`.
- npm libraries are fine when they earn their keep (Chess uses `chess.js` for
  full rules) — add them to the root package.json; pure-JS libraries bundle
  into views too.

## views/ — one component per role

Each declared role gets `views/<role>.tsx`, default-exporting a component
that receives `GameViewProps` (see `src/shared/plugin.ts`): your filtered
`view`, `players` (seat order, names + avatars), `me`, `over`, a `move()`
sender, and `serverNow`. For countdowns use the hooks in
`src/shared/gameKit.ts` (`useDeadline`, `formatSeconds`) — they handle
device clock drift and firing expiry moves.

Helper components can live anywhere in the folder; only files named after
roles become entry points. Import a `style.css` for styling — prefix your
class names with the game id to avoid collisions.

## Checklist before shipping

- `npm run typecheck` passes.
- Table view is display-only (no gameplay `onClick`s).
- `playerView` hides everything a player shouldn't see.
- Play a full game via phones; consider a bot test in `tests/` (see
  `tests/memory.e2e.mjs` for the pattern).
- Nothing scrolls. Views sit in a fixed viewport box: never `min-height:
  100vh` inside a view, and reserve a fixed height for any line whose text
  changes, so nothing shifts under a thumb already reaching for a button.
- Class names are prefixed with the game id — and never a bare utility name.
  On a `<button>`, `ghost` matches the platform's own `button.ghost`
  (specificity 0-1-1, beating your single class) and silently puts its
  padding back; that once resized every cell on the Battleship board.
  `button:not(:disabled):hover` (0-2-1) will likewise repaint your board.
- A scroll container that centres its content clips the first row above the
  scroll origin, where nothing can bring it back — align to the start, or use
  `justify-content: safe center`.
- If it ships a bot: `ONLY=<id> npx tsx tests/bot-drive.test.ts` reaches a
  real ending at every level with zero rejected moves.
