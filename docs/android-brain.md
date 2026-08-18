# Running the brain on an Android phone

The brain is plain Node, so an Android phone can host the whole thing via
[Termux](https://termux.dev) (install from F-Droid — the Play Store build is
outdated). The phone then plays the **table screen** too: its own Chrome in
fullscreen is the table, and it's a touchscreen so hosting (picking/starting
games) works naturally.

One-time setup, in Termux:

```sh
pkg update
pkg install nodejs-lts git
git clone https://github.com/nimrodtalmon/UGE.git
cd UGE && npm install
```

Each game night:

```sh
cd UGE && npm start
```

Then open Chrome on the same phone at `http://localhost:8000`, and use
Chrome's menu → "Add to Home screen" for a fullscreen table. Other phones
scan the QR as usual.

Networking options, road-first:
- **Same WiFi**: everyone on the home network; the QR shows the phone's LAN IP.
- **No WiFi at all**: turn on the phone's hotspot *before* `npm start`;
  everyone joins the hotspot. The brain binds all interfaces and prefers
  private ranges, so the QR should show the hotspot address (typically
  `192.168.x.x`).

Notes:
- Keep Termux alive: run `termux-wake-lock` before `npm start` (and plug the
  phone in) so Android doesn't kill the server mid-game.
- The Update button works the same (git pull + relaunch).
- Untested corners exist — if the QR shows a wrong IP on hotspot, check
  `ifconfig` in Termux and report back.
