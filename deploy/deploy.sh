#!/usr/bin/env bash
# Build the site and put it live on www.gtio.work.
#
#   deploy/deploy.sh            build + rsync + nginx conf + reload
#   deploy/deploy.sh --no-build skip the local build
#
# dist/ → rsync → the origin's ~/nginx/html/www → nginx reload → Cloudflare.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
# The origin sits behind Cloudflare, so its address stays out of this repo.
# Set these in deploy/.env locally, or as repository variables in CI.
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DEPLOY_HOST="${DEPLOY_HOST:?set DEPLOY_HOST, see deploy/.env.example}"
DEPLOY_USER="${DEPLOY_USER:?set DEPLOY_USER, see deploy/.env.example}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
HOST="$DEPLOY_USER@$DEPLOY_HOST"
SSH="ssh -p $DEPLOY_PORT"
REMOTE_HTML="nginx/html/www"
REMOTE_CONF="nginx/conf/conf.d"

if [[ "${1:-}" != "--no-build" ]]; then
  echo "▸ build"
  (cd "$ROOT/site" && pnpm build)
fi

echo "▸ server prep"
$SSH "$HOST" 'mkdir -p ~/nginx/html/www'

echo "▸ rsync dist"
# --delay-updates + --delete-delay: stage every changed file remotely, then
# swap them in and delete the removals at the end, so there is no window where
# index.html points at assets that are not on disk yet. --delete also means the
# previous build's content-hashed assets go away rather than piling up.
rsync -az --delete-delay --delay-updates -e "$SSH" "$ROOT/site/dist/" "$HOST:$REMOTE_HTML/"

echo "▸ nginx conf"
# This site's vhost, and nothing else. conf.d on the origin also holds the
# machine's catch-all and every other service's vhost (jianghu, cipher, defai,
# …), none of which this repo owns. Hence one named file and no --delete.
rsync -az --delay-updates -e "$SSH" "$HERE/www.conf" "$HOST:$REMOTE_CONF/"

echo "▸ nginx test + reload"
$SSH "$HOST" 'docker exec nginx nginx -t && docker exec nginx nginx -s reload'

echo "▸ smoke"
# Each path gets three tries before it counts as a failure, and a curl that
# cannot connect must not abort the script: by this point the deploy has already
# happened, so a flaky link on the machine running this should report honestly
# rather than exit on the first blip and skip the remaining checks.
failed=()
# The film lives under a content hash, so ask the build which one shipped
# rather than naming a path that moves every time it is recut.
rev="$(basename "$(ls -d "$ROOT"/site/dist/film/*/ 2>/dev/null | head -1)")"
paths=(/ /zh/ /en/ /img/og.jpg /gpu/hero.webp)
[ -n "$rev" ] && paths+=("/film/$rev/city.json")
for path in "${paths[@]}"; do
  code=000
  for _ in 1 2 3; do
    code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -H 'Accept-Language: zh-CN' \
      "https://www.gtio.work$path" || echo 000)
    [ "$code" = "200" ] && break
    sleep 2
  done
  printf '  %-16s %s\n' "$path" "$code"
  [ "$code" = "200" ] || failed+=("$path")
done

if [ ${#failed[@]} -gt 0 ]; then
  echo "FAILED: ${failed[*]} did not return 200." >&2
  echo "The deploy itself completed; check whether this is the site or this machine's network." >&2
  exit 1
fi
echo "done."
