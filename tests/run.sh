#!/bin/bash
# Build the site, serve it, and run the browser tests in headless Chrome.
# Needs Docker (for the build), Node 22+, and Google Chrome.
#
# Usage: tests/run.sh                 build, then run every test
#        tests/run.sh plan cook       run only these tests
#        tests/run.sh --no-build      skip the build and test the current _site
#
# Screenshots land in tests/.shots/ (gitignored).

set -euo pipefail

SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=4123
build=1
names=()
for arg in "$@"; do
  case "$arg" in
    --no-build) build=0 ;;
    *) names+=("$arg") ;;
  esac
done

if [ "$build" = 1 ]; then
  if ! docker info >/dev/null 2>&1; then
    echo "Docker isn't running. Start Docker Desktop, or pass --no-build." >&2
    exit 1
  fi
  echo "Building the site..."
  docker run --rm -v "$SITE_DIR":/site -v hawkins-bundle:/usr/local/bundle -w /site ruby:3.3 \
    sh -c "bundle install --quiet && bundle exec jekyll build --quiet" 2>&1 | grep -v faraday || true
fi
if [ ! -f "$SITE_DIR/_site/index.html" ]; then
  echo "No built site in _site/. Run without --no-build." >&2
  exit 1
fi

# Serve _site unless something is already serving it on this port.
server=""
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$SITE_DIR/_site" >/dev/null 2>&1 &
  server=$!
  trap 'kill "$server" 2>/dev/null || true' EXIT
  for _ in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.1; done
fi

if [ ${#names[@]} -eq 0 ]; then
  tests=("$SITE_DIR"/tests/*.test.mjs)
else
  tests=()
  for name in "${names[@]}"; do tests+=("$SITE_DIR/tests/$name.test.mjs"); done
fi

passed=0
failed=()
for test in "${tests[@]}"; do
  name="$(basename "$test" .test.mjs)"
  if [ ! -f "$test" ]; then
    echo "No test called $name." >&2
    failed+=("$name")
    continue
  fi
  echo
  echo "== $name"
  if node "$test"; then
    passed=$((passed + 1))
  else
    failed+=("$name")
  fi
done

echo
if [ ${#failed[@]} -eq 0 ]; then
  echo "All $passed test files passed."
else
  echo "$passed passed, ${#failed[@]} failed: ${failed[*]}"
  exit 1
fi
