#!/usr/bin/env bash
# Supervisor for the brain: exit code 42 means "update requested" —
# pull the latest code, refresh dependencies, and relaunch.
set -u
cd "$(dirname "$0")/.."
relaunch=""
while true; do
  # relaunches after an update never open a new tab — the table tab reloads itself
  UGE_NO_OPEN="${UGE_NO_OPEN:-$relaunch}" npx tsx src/server/index.ts
  code=$?
  relaunch=1
  if [ "$code" -ne 42 ]; then
    exit "$code"
  fi
  echo "uge: update requested — pulling latest code…"
  git pull --rebase
  npm install
done
