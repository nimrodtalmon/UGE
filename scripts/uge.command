#!/bin/bash
# Launched by UGE.app — runs the brain with visible logs.
cd "$(dirname "$0")/.."
# login shell so node/npm from brew/nvm are on PATH when launched from Finder
exec /bin/bash -lc 'npm start'
