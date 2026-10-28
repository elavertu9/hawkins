#!/bin/bash
# Build the site, serve it, and run the browser tests in headless Chrome.
# Needs Docker (for the build), Node 22+, and Google Chrome.
#
# Usage: tests/run.sh                 build, then run every test
#        tests/run.sh plan cook       run only these tests
#        tests/run.sh --no-build      skip the build and test the current _site
#        JOBS=1 tests/run.sh          run the test files one at a time (default 4 at once)
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
  disown "$server" # no "Terminated" message when it's stopped at the end
  for _ in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.1; done
fi

if [ ${#names[@]} -eq 0 ]; then
  tests=("$SITE_DIR"/tests/*.test.mjs)
else
  tests=()
  for name in "${names[@]}"; do tests+=("$SITE_DIR/tests/$name.test.mjs"); done
fi

# Run the test files a few at a time (each has its own Chrome), then print
# each one's output in order. JOBS=1 runs them one by one.
JOBS="${JOBS:-4}"
logs="$(mktemp -d)"
trap 'kill "$server" 2>/dev/null || true; rm -rf "$logs"' EXIT
for test in "${tests[@]}"; do
  name="$(basename "$test" .test.mjs)"
  if [ ! -f "$test" ]; then echo "No test called $name." >&2; echo 1 > "$logs/$name.status"; continue; fi
  printf '%s\n' "$test"
done | xargs -P "$JOBS" -I{} sh -c 'name="$(basename "$1" .test.mjs)"; node "$1" > "$2/$name.log" 2>&1; echo $? > "$2/$name.status"' _ {} "$logs"

passed=0
failed=()
for test in "${tests[@]}"; do
  name="$(basename "$test" .test.mjs)"
  echo
  echo "== $name"
  [ -f "$logs/$name.log" ] && cat "$logs/$name.log"
  if [ "$(cat "$logs/$name.status" 2>/dev/null)" = 0 ]; then
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
