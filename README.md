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
shows a QR code; phones on the same WiFi scan it to join.

Set `UGE_NO_OPEN=1` to skip auto-opening the browser.

## Layout

```
src/server/    brain: static serving, session info, QR
src/client/    role views served to browsers (table, join)
games/         game plugins — each fully self-contained (stage 3+)
```
