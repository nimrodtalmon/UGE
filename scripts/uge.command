#!/bin/bash
# Launched by UGE.app — pulls the latest code, then runs the brain with
# visible logs. If there's no network, starts the local version as-is.
cd "$(dirname "$0")/.."
# login shell so node/npm/git from brew/nvm are on PATH when launched from Finder
exec /bin/bash -lc '
  before=$(git rev-parse HEAD)
  if git pull --rebase; then
    if [ "$(git rev-parse HEAD)" != "$before" ]; then
      npm install
    fi
  else
    echo "uge: could not pull (offline?) — starting the local version"
  fi
  npm start
'
