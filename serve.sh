#!/bin/bash
# Preview the site locally, with the same Jekyll setup GitHub Pages uses.
# Opens http://localhost:4000 and reloads the page whenever you save a file.
#
# Usage: ./serve.sh [port]     (Ctrl+C to stop)

set -euo pipefail

PORT="${1:-4000}"
LIVERELOAD_PORT=35729
IMAGE="ruby:3.3"
CONTAINER="hawkins-preview"
GEM_CACHE="hawkins-bundle"   # Docker volume, so gems install once instead of every run
SITE_DIR="$(cd "$(dirname "$0")" && pwd)"
URL="http://localhost:$PORT/"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker isn't installed. Get Docker Desktop: https://www.docker.com/products/docker-desktop/" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Starting Docker Desktop..."
  open -a Docker
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  if ! docker info >/dev/null 2>&1; then
    echo "Docker didn't start. Open Docker Desktop manually and try again." >&2
    exit 1
  fi
fi

# Clear out a preview left running from an earlier session.
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

# Open the browser as soon as the site responds.
(
  for _ in $(seq 1 120); do
    if curl -fs -o /dev/null "$URL"; then
      open "$URL"
      exit 0
    fi
    sleep 1
  done
) &

echo "Building the site. It opens at $URL when ready. Press Ctrl+C to stop."

TTY_FLAGS="-i"
[ -t 0 ] && TTY_FLAGS="-it"

exec docker run --rm $TTY_FLAGS --init --name "$CONTAINER" \
  -p "$PORT:4000" -p "$LIVERELOAD_PORT:35729" \
  -v "$SITE_DIR":/site -v "$GEM_CACHE":/usr/local/bundle -w /site \
  "$IMAGE" sh -c "bundle install --quiet && bundle exec jekyll serve --host 0.0.0.0 --livereload --force_polling"
