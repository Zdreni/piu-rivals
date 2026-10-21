#!/usr/bin/env bash
# Updates the server on the VPS: code, packages, Chromium, database tables, then restarts the pm2 apps.
#
#   bash server/deploy.sh [<commit>]
#
# Without a commit it deploys the latest origin/main. The deploy workflow runs it over SSH through a forced
# command (see docs/vps_deployment.md), so the commit then comes in SSH_ORIGINAL_COMMAND.
# Only fast-forwards: local changes to tracked files on the VPS stop the deploy instead of being lost.
set -euo pipefail

cd "$(dirname "$0")/.."

# Non-interactive SSH shells don't read the profile, so node from nvm isn't on the PATH by itself.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi

health_url="http://127.0.0.1:${PORT:-9876}/health"

if [ "${1:-}" != "--updated" ]; then
  target="${1:-${SSH_ORIGINAL_COMMAND:-}}"
  if [ -n "$target" ] && ! [[ "$target" =~ ^[0-9a-f]{40}$ ]]; then
    echo "deploy: expected a full commit hash, got '$target'" >&2
    exit 2
  fi

  previous=$(git rev-parse HEAD)
  git fetch --quiet origin main
  git merge --ff-only --quiet "${target:-origin/main}"
  echo "deploy: $(git log -1 --format='%h %s')"
  # The rest runs from the new version of this script.
  exec bash server/deploy.sh --updated "$previous"
fi

previous="$2"

if [ ! -d node_modules ] || ! git diff --quiet "$previous" HEAD -- package-lock.json; then
  echo "deploy: installing packages"
  npm ci --workspace server --include-workspace-root
  (cd server && npx playwright install chromium)
fi

echo "deploy: migrating the database"
npm run migrate --workspace server

# A worker restart stops the scrape run in progress; it shows as "interrupted" and has to be started again.
# So the worker restarts only when something it runs changed. Changes to just the API, the site, the shared
# types (the worker imports them only as types), the extensions, tests and docs leave it running.
api_only='^(server/src/api/|server/src/server\.ts$|server/test/|server/deploy\.sh$|server/README\.md$|shared/|web/|docs/|piuscores-extension/|piuscores-scrap-extension/|\.github/|[^/]+\.md$|\.gitignore$)'
worker_changes=$(git diff --name-only "$previous" HEAD | grep -Ev "$api_only" || true)

echo "deploy: restarting"
if [ -n "$worker_changes" ] || ! pm2 describe piu-rivals-worker > /dev/null 2>&1; then
  pm2 startOrRestart server/ecosystem.config.cjs
else
  echo "deploy: the worker's code is unchanged, so it keeps running"
  pm2 startOrRestart server/ecosystem.config.cjs --only piu-rivals-api
fi

pm2 save

for _ in $(seq 30); do
  if curl -fsS "$health_url" > /dev/null 2>&1; then
    echo "deploy: done, the API is up"
    exit 0
  fi

  sleep 1
done

echo "deploy: the API didn't answer $health_url within 30 s" >&2
pm2 logs piu-rivals-api --lines 30 --nostream >&2 || true
exit 1
