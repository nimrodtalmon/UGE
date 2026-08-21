# UGE — Universal Game Engine

*Founding spec, v0.2 (Aug 2026). Source of truth for Claude Code and human
contributors. Keep updated as decisions are made.*

## Vision

A modular universal tabletop game system. Long-term: physical batteryless NFC
e-ink cards/tiles ("static" pieces, rewritable between games) plus wireless
dynamic displays, orchestrated by a small brain device. Short-term (v0): pure
software — a laptop as brain+table, players' phones as hands, any browser as a
client. Hardware modules attach later without changing the architecture.

**Games are plugins.** The central product bet: third parties (and Nimrod's
future self, students, kids) will program new games into UGE. Everything about
the platform must serve a clean, documented, stable plugin API. When in doubt,
choose the design that makes game authors' lives simpler over the one that
makes the platform's code simpler.

Design principles:
- **Clients are dumb browsers.** The only client requirement, forever: WiFi + a
  browser. No installs.
- **The brain is the only stateful machine.** One server owns game state.
- **Roles, not devices.** A game declares roles (table, hand, scoreboard...);
  devices claim roles in a lobby. The brain's own screen is always available as
  a client.
- **Games are data + pure functions**, packaged as self-contained plugins.
  Adding a game must never touch platform code.
- **Road-first.** Everything must work with zero internet (local network only).

## Architecture (v0)

```
MacBook Air ("brain")
├── boardgame.io server (Node) — game state, moves, sync
├── static file server — serves all client pages
├── Lobby service — device registry, role assignment, game feasibility
└── Chrome fullscreen — the "table" client + join QR

Players' phones — browser → lobby → claim role → play
```

- Framework: **built-in minimal engine** (v0 decision; see log). Game logic as
  pure functions in the boardgame.io shape — `setup`, `moves`, `playerView`,
  `isOver` — but state sync is the platform's own HTTP polling, shared with
  the lobby. Revisit boardgame.io if sync needs outgrow polling.
- Language: **TypeScript** throughout — the plugin API is a contract; types are
  its documentation and enforcement.
- UI: simple — React or vanilla TS, big touch targets, phone-first CSS.
- Networking v0: all devices on the same LAN (home WiFi or a phone hotspot);
  clients browse to `http://<air-ip>:8000`. **Join UX v0: plain URL QR** shown
  on the table screen (scan → browser opens lobby). WiFi-QR auto-join +
  captive portal is a v2/hardware-brain feature; do not build now.

## Game plugin format

Every game is a folder under `games/`, containing:

```
games/<id>/
├── manifest.json     # metadata + role requirements (below)
├── game.ts           # boardgame.io game object: setup, moves, phases, playerView
├── views/            # one UI component per role (table.tsx, hand.tsx, ...)
└── assets/           # optional images, word lists, etc.
```

`manifest.json`:

```json
{
  "id": "memory",
  "name": "Memory",
  "players": {"min": 2, "max": 6},
  "roles": {
    "table": "required",        // required | optional | none
    "hand": "per-player",       // per-player | per-team | none
    "extras": []                 // e.g. ["scoreboard", "discard"]
  },
  "pieces": {"static": 0, "dynamic": 0}   // forward-compat for physical modules
}
```

The platform discovers plugins by scanning `games/` at startup — no
registration code. The lobby computes feasible games from connected devices +
player count and greys out the rest. Largest screen auto-assigned "table";
manual reassignment allowed.

## v0 scope (build now)

1. `npm start` on the Air launches server + opens table view with join QR.
2. Lobby: devices join via QR/URL, appear as named tiles, claim roles; game
   selection filtered by feasibility.
3. Three launch games, chosen to stress different platform features:
   - **Memory** (2–6): simplest possible plugin. Table shows card grid; phones
     show turn indicator + score; flips via table touch or phone.
   - **Codenames** (4+, two teams): secret per-role state — two phones claim
     "spymaster" role and see the key card; table shows the word grid.
   - **Alias** (4+, two teams): timed rounds — explainer's phone shows the
     word queue (tap: got-it / skip); table shows countdown + team scores;
     explainer role rotates each round. Stresses timers, team structure, role
     rotation. Word list in `assets/` (start EN; word lists must be pluggable
     files — HE list later).
4. Hot-reload of game plugins in dev; platform never special-cases a game.

Out of scope for v0: accounts, internet play, persistence beyond a session,
any hardware.

## Roadmap (do not build yet; design for compatibility)

- **v1 — static pieces**: NFC e-ink tiles/cards (battery-free; image persists
  unpowered). Written by tapping an Android phone (NFC-writer is just another
  client role) or later a multi-slot dock. Deck-compiler: manifest → rendered
  piece faces (PNG) → NFC write queue. Likely vendor: Good Display
  (documented protocol); decision deliberately deferred.
- **v2 — dynamic pieces & dedicated brain**: BLE e-ink tags as mutable in-game
  surfaces; big e-ink table display; Pi Zero 2 W brain-in-a-box with its own
  hotspot, captive portal, WiFi-QR auto-join.
- **Product framing**: base box + expansion module packs; plugin marketplace
  for community games. Platform/manifest must make both plug-and-play.

## Conventions

- Node ≥ 22. TypeScript, strict mode.
- Each game fully contained in `games/<id>/`; platform code never imports from
  a specific game.
- Commits small and topical. Always `git pull --rebase` before pushing.
- Dry, precise docs. No overselling. Mark open decisions `TODO(nimrod):`.
- Owner: github.com/nimrodtalmon/uge. License: MIT.

## Decisions log

- 2026-08: Name: **UGE**. Language: TypeScript (CC's discretion on React vs
  vanilla). Join UX v0: plain URL QR. NFC vendor: leaning Good Display,
  deferred. Launch games: Memory, Codenames, Alias.
- 2026-08: UI: React. The table screen is the host (Kahoot-style): it picks
  the game and starts it; phones are controllers. Selection is allowed with
  zero players; only Start is gated. Away/disconnect: away after 5s of missed
  polls (seat + role kept), dropped after 45s.
- 2026-08: v0 game engine is **built-in**, not boardgame.io: plugin `game.ts`
  keeps boardgame.io's pure-function shape (`setup`/`moves`/`playerView`/
  `isOver`), so migrating later stays cheap, but sync reuses the lobby's
  polling — far fewer moving parts (no socket.io/Koa beside Express).
  TODO(nimrod): veto if boardgame.io is wanted after all.
- 2026-08: Update-in-place: table screen's Update button → server exits 42 →
  start.sh supervisor pulls, installs, relaunches. Extra launch game:
  **Lights Out** (1 player) as the minimal engine-exercising plugin.
- 2026-08: The table is display-only during games (no tap-to-play on the
  table; it still hosts the lobby and drives timer moves). Phones auto-join
  as players when a game is selected; sitting out is explicit. Timed games:
  the platform passes a server clock (`ctx.now`, `serverNow`) and
  `src/shared/gameKit.ts` gives views drift-safe countdowns. Extra launch
  game: **Trivia** (1–8). Alias v0 is rotating-explainer with individual
  scores, 2+ players; the spec's team mode is deferred.
  TODO(nimrod): veto individual-scores Alias if team play is wanted for v0.
- 2026-08: Lobby flow: the table opens with a game-night wizard ("N players,
  M phones") and matches games against the declared group (manifest gains
  optional `phones.min` for shared-device games); Start still gates on who
  actually joined. Groundwork for "needs dice / NFC pieces" annotations via
  the existing `pieces` field — display deferred.
- 2026-08: Manifest gains `modes` — variants with own player/phone needs and
  an opaque `config` passed to `setup` (plus `ctx.group`). Non-fitting games
  hide behind an expander. Shared-phone modes shipped: Alias & Memory "pass
  the phone", UNO hotseat (locked handoff), Codenames one-phone (map device
  records shouted guesses), Trivia quick/classic. Poker stays phone-per-
  player (hotseat betting with hidden holes is too leaky to be fun).
- 2026-08: Public deployment (Render): public mode auto-detects
  `RENDER_EXTERNAL_URL` (or `UGE_PUBLIC=1`). Rooms = one Lobby per 4-letter
  code (`Map` in `src/server/rooms.ts`), landing page hosts/joins rooms,
  routes room-scoped under `/r/<code>` with the classic unscoped paths bound
  to a default room so local Air/Termux/Mac-app flows are untouched. Scoped
  syncs re-create missing rooms (free-tier sleep ⇒ reconnect, not strand);
  idle rooms GC after 30 min; Update hidden in public mode (deploys via git
  push). Game plugins needed zero changes.
- 2026-08: Library grows to 18 games: added Werewolf (moderator-less,
  night/day/vote), Shesh-Besh (backgammon, no doubling cube), Stop!
  (categories), Liar's Dice, Dial (Wavelength-style teams), Battleship,
  Dice Poker (Yahtzee rules, renamed), Hearts. Each built as a pure plugin
  (no platform changes), audited for playerView leaks + hostile input, and
  covered by tests/more-games.e2e.mjs.
- 2026-08: Lobby redesign + solo shelf: the home screen is an app bar of
  tappable pills (avatar → profile sheet, room code → invite sheet with
  copy/switch room), a group card of avatar bubbles, per-game gradient
  cards with a Ready/Solo/Party/All segmented filter (replacing the "+N
  more" expander), a sticky bottom start bar, and bottom sheets instead of
  overlays. Four one-player games added: Solitaire, 2048, Minesweeper,
  Word Hunt (Wordle-style, solo + race). Library: 22 games.
- 2026-08: **Flow rev (v2)**: the setup wizard is gone. Opening UGE lands you
  in a home screen as a ready-to-play player (auto name+avatar, editable);
  the group is DERIVED live from connected devices — one device = one player
  unless it says "N of us here" (per-device `seats`), and any device may
  volunteer as the table screen (`isTable`, opt-in; the table holds no seat).
  Endpoints: `/api/lobby/{seats,table}` replace `/api/lobby/setup`. One
  unified client (`src/client/shared/App.tsx`) serves `/` and `/join`; the
  only difference is the localStorage identity key, so one machine can still
  open a second tab as a player. The room panel ("＋ Add people") holds the
  QR, the table toggle, the seats stepper, room code/switch, and Update.
  Solo play needs no table at all; game controls appear on every device when
  no table exists. Tests share `tests/helpers.mjs`.
- 2026-08: Feedback round: UNO cards can be flicked at the pile to play;
  game screens are fixed viewport boxes (no page scroll/bounce during play);
  Sketch runs 3 drawings per player (cap 15); ALL games mark the table
  screen optional (phones are self-sufficient; lobby only auto-assigns the
  table role to a real table screen when the game treats it as optional);
  public tables get a "⇄ switch" room link; Dice Poker renamed **Yatze**.
  Alias stays party 2+/teams 4+ with 1 shared phone (user reconfirmed).
- 2026-08: Road mode: an optional gitignored `uge.config.json` can carry the
  WiFi credentials of whatever network the brain shares (phone hotspot /
  Internet Sharing); the table then shows a two-step QR (join WiFi → open
  UGE). This is a static join-network QR only — auto-hotspot and captive
  portal remain v2 hardware-brain features.
- 2026-08: **AI opponents** are a first-class plugin feature: a manifest
  `bots.levels` plus `bot(state, ctx)` in `game.ts` lets the lobby offer
  "play against the computer", pre-ticked when a game needs more players
  than are in the room. Bots hold a seat but no phone, so one person alone
  can play Chess; shared "pass the phone" modes (`GameMode.shared`) are
  hidden whenever a bot is in the game. Manifest `help` ({goal, steps,
  notes}) is likewise expected of every game and shows in the game sheet and
  the mid-game `?`. `tests/bot-drive.test.ts` drives every bot game at every
  level through the real move functions.
- 2026-08: Library reaches **37 games**. Added Connect Four, Reversi,
  Checkers, Mancala, Dominoes, Blackjack, Sudoku, Dots & Boxes, Set, Boggle,
  Ludo, Go Fish. Battleship reworked: empty sea, drag your own fleet, one
  board at a time. All 37 declare the table optional and ship help; 21 have
  AI.
- 2026-08: Platform hardening, all found by verification rather than
  reported: (a) one plugin that fails to load OR to bundle is listed as "not
  playable" instead of taking the brain down with it; (b) a malformed
  `/api/lobby/sync` used to store a nameless device and then 500 every
  snapshot in that room forever — one curl could end a public game night, so
  the lobby now validates what it takes off the network; (c) `setBots` no
  longer discards a mode the player chose on purpose; (d) the role-claim
  buttons went back on the home screen, without which Codenames could not be
  started at all.
- 2026-08: Two recurring UI traps, documented in `docs/adding-games.md`
  because they cost real time: a bare utility class name on a `<button>`
  (e.g. `ghost`) matches the platform's own `button.ghost` and silently
  restores its padding — that resized every cell on the Battleship board;
  and a scroll container that centres its content clips the first row above
  the scroll origin where nothing can reach it (align to start, or
  `justify-content: safe center`).
