#!/bin/bash
# Encrypt the classified recipes in _classified/ into locked pages in _recipes/.
# Run it after adding or editing a classified recipe, then commit as usual.
# The clearance code lives in .classified-code (one line). _classified/ and
# .classified-code are gitignored, so the readable recipes and the code never
# reach GitHub.
#
# Usage: ./classified.sh

set -euo pipefail

SITE_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running. Start Docker Desktop and try again." >&2
  exit 1
fi

docker run --rm -v "$SITE_DIR":/site -v hawkins-bundle:/usr/local/bundle -w /site ruby:3.3 \
  sh -c "bundle install --quiet && ruby scripts/classified.rb"
