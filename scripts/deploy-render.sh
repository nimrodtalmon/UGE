#!/usr/bin/env bash
# Create (or redeploy) the UGE web service on Render and wait until it's live.
# Usage: RENDER_API_KEY=rnd_... bash scripts/deploy-render.sh
# The key comes from the Render dashboard (Account Settings → API Keys) and
# must never be committed to the repo.
set -euo pipefail
: "${RENDER_API_KEY:?set RENDER_API_KEY (Render dashboard → Account Settings → API Keys)}"
api() { curl -sS -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" "$@"; }
py() { python3 -c "$1"; }

owner=$(api https://api.render.com/v1/owners | py 'import json,sys; print(json.load(sys.stdin)[0]["owner"]["id"])')
echo "owner: $owner"

existing=$(api "https://api.render.com/v1/services?name=uge&limit=1" \
  | py 'import json,sys; d=json.load(sys.stdin); print(d[0]["service"]["id"] if d else "")')
if [ -n "$existing" ]; then
  sid=$existing
  echo "service exists: $sid — triggering a deploy"
  api -X POST "https://api.render.com/v1/services/$sid/deploys" -d '{}' > /dev/null
else
  sid=$(api -X POST https://api.render.com/v1/services -d @- <<EOF | py 'import json,sys; print(json.load(sys.stdin)["service"]["id"])'
{
  "type": "web_service",
  "name": "uge",
  "ownerId": "$owner",
  "repo": "https://github.com/nimrodtalmon/UGE",
  "branch": "main",
  "autoDeploy": "yes",
  "serviceDetails": {
    "runtime": "node",
    "plan": "free",
    "region": "frankfurt",
    "envSpecificDetails": {
      "buildCommand": "npm install",
      "startCommand": "npm run start:once"
    }
  },
  "envVars": [{ "key": "UGE_NO_OPEN", "value": "1" }]
}
EOF
)
  echo "created service: $sid"
fi

echo "waiting for the deploy to go live (free-tier builds take a few minutes)…"
for _ in $(seq 1 90); do
  status=$(api "https://api.render.com/v1/services/$sid/deploys?limit=1" \
    | py 'import json,sys; d=json.load(sys.stdin); print(d[0]["deploy"]["status"] if d else "pending")')
  echo "  $status"
  case "$status" in
    live) break ;;
    build_failed|update_failed|canceled|deactivated)
      echo "deploy failed — check the logs in the Render dashboard" >&2
      exit 1 ;;
  esac
  sleep 10
done

url=$(api "https://api.render.com/v1/services/$sid" \
  | py 'import json,sys; print(json.load(sys.stdin)["serviceDetails"]["url"])')
echo "live: $url"
