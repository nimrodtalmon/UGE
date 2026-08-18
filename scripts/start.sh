#!/usr/bin/env bash
# Supervisor for the brain: exit code 42 means "update requested" —
# pull the latest code, refresh dependencies, and relaunch.
set -u
cd "$(dirname "$0")/.."
first=1
while true; do
  if [ "$first" = 1 ]; then
    npx tsx src/server/index.ts
    first=0
  else
    # relaunch after an update: the table tab reloads itself — never open a new one
    UGE_NO_OPEN=1 npx tsx src/server/index.ts
  fi
  code=$?
  if [ "$code" -ne 42 ]; then
    exit "$code"
  fi
  echo "uge: update requested — pulling latest code…"
  git pull --rebase
  npm install
done
