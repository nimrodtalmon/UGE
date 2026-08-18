#!/usr/bin/env bash
# Creates a double-clickable UGE.app that launches the brain in a Terminal
# window (visible logs; close the window or Ctrl+C to stop the server).
# Run once on the Mac:  bash scripts/install-mac-app.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-/Applications}"
APP="$DEST/UGE.app"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>UGE</string>
  <key>CFBundleDisplayName</key><string>UGE</string>
  <key>CFBundleIdentifier</key><string>dev.uge.brain</string>
  <key>CFBundleVersion</key><string>0.1</string>
  <key>CFBundleExecutable</key><string>uge</string>
  <key>CFBundleIconFile</key><string>uge</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST

cat > "$APP/Contents/MacOS/uge" <<LAUNCH
#!/bin/bash
exec open -a Terminal "$REPO/scripts/uge.command"
LAUNCH
chmod +x "$APP/Contents/MacOS/uge"

# icon: build .icns from the bundled PNG
if command -v sips >/dev/null && command -v iconutil >/dev/null && [ -f "$REPO/scripts/uge-icon.png" ]; then
  ICONSET="$(mktemp -d)/uge.iconset"
  mkdir -p "$ICONSET"
  for sz in 16 32 128 256 512; do
    sips -z "$sz" "$sz" "$REPO/scripts/uge-icon.png" --out "$ICONSET/icon_${sz}x${sz}.png" >/dev/null
    sips -z "$((sz * 2))" "$((sz * 2))" "$REPO/scripts/uge-icon.png" --out "$ICONSET/icon_${sz}x${sz}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/uge.icns"
fi

# refresh Finder's icon cache for the bundle
touch "$APP"

echo "installed: $APP"
echo "First launch: right-click the app → Open (it isn't code-signed)."
