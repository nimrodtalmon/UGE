# Adding a game

A game is one folder under `games/<id>/` — the platform discovers it at
startup by scanning for `manifest.json`. No registration, no platform edits.
(Practical loop: ask Claude Code to write one in this repo, push, then hit
**Update** on the table screen — or write it by hand.)

```
games/<id>/
├── manifest.json     # metadata (below)
├── game.ts           # rules: pure functions over plain state
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

The table asks for the group first ("N players, M phones") and matches games
against it. Phone need defaults to one per player (when `hand` is
per-player) plus one per extra role; set `phones.min` when devices can be
shared (Codenames: one spymasters device + one shared guessing phone → 2).

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
