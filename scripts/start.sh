#!/usr/bin/env bash
# Supervisor for the brain: exit code 42 means "update requested" —
# pull the latest code, refresh dependencies, and relaunch.
set -u
cd "$(dirname "$0")/.."
while true; do
  npx tsx src/server/index.ts
  code=$?
  if [ "$code" -ne 42 ]; then
    exit "$code"
  fi
  echo "uge: update requested — pulling latest code…"
  git pull --rebase
  npm install
done
