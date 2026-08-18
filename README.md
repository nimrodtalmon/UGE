# UGE — Universal Game Engine

A modular tabletop game platform. v0: a laptop is the brain and the table,
players' phones are the hands, games are plugins. See [CLAUDE.md](CLAUDE.md)
for the founding spec.

## Quickstart

Requires Node ≥ 22.

```sh
npm install
npm start
```

`npm start` builds the client bundles and starts the brain on port 8000. The
table view opens in your browser (or browse to `http://localhost:8000`). It
shows a QR code; phones on the same WiFi scan it to join the lobby and enter
a name. The table screen is the host: it picks the game and starts it once
every phone has claimed a role — phones are controllers, Kahoot-style.

The table screen's **Update** button pulls the latest code from git and
restarts the brain in place; the same tab reloads itself and phones
reconnect on their own. Set `UGE_NO_OPEN=1` to skip auto-opening the browser.

**Mac app**: `bash scripts/install-mac-app.sh` creates a double-clickable
`UGE.app` in /Applications (first launch: right-click → Open, it's unsigned).

**Screens are just browsers.** A smart TV works as the table: open
`http://<brain-ip>:8000` in the TV browser (or cast the Chrome tab). Any
tablet can claim the table role from its own lobby.

The brain runs anywhere Node ≥ 22 runs — including an Android phone via
Termux, hotspot and all: see [docs/android-brain.md](docs/android-brain.md).
To write a new game, see [docs/adding-games.md](docs/adding-games.md).

## Layout

```
src/server/    brain: lobby state, plugin discovery, static serving, QR
src/shared/    types shared by brain and clients (manifest, lobby snapshot)
src/client/    role views served to browsers (table, join)
games/         game plugins — each fully self-contained
tests/         browser e2e tests (playwright-core; see file headers)
```

Games are discovered by scanning `games/<id>/` at startup; a plugin is
`manifest.json` + `game.ts` (pure functions: `setup`, `moves`, `playerView`,
`isOver`) + one React view per role in `views/`. The lobby dims games that
aren't feasible with the connected devices but any game can be selected;
only Start waits for requirements. The largest connected screen is
auto-assigned the `table` role; any device can claim it manually.
