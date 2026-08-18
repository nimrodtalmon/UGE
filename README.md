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
restarts the brain in place; phones reconnect on their own. Set
`UGE_NO_OPEN=1` to skip auto-opening the browser.

The brain runs anywhere Node ≥ 22 runs (MacBook now; a Raspberry Pi or any
always-on box later — nothing is macOS-specific except the auto-open).

## Layout

```
src/server/    brain: lobby state, plugin discovery, static serving, QR
src/shared/    types shared by brain and clients (manifest, lobby snapshot)
src/client/    role views served to browsers (table, join)
games/         game plugins — each fully self-contained
```

Games are discovered by scanning `games/<id>/` at startup; a plugin is
`manifest.json` + `game.ts` (pure functions: `setup`, `moves`, `playerView`,
`isOver`) + one React view per role in `views/`. The lobby dims games that
aren't feasible with the connected devices but any game can be selected;
only Start waits for requirements. The largest connected screen is
auto-assigned the `table` role; any device can claim it manually.
