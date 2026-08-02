#!/usr/bin/env bash
# Kitchen Table — run every suite against a local copy of the site.
#
#   tests/run.sh              all seven suites
#   KT_ONLY="kt feat" tests/run.sh   just those two
#   KT_PORT=8901 tests/run.sh        serve on another port
#
# Needs node with the `playwright` package resolvable (npm i inside tests/, a
# global install via NODE_PATH, or KT_CHROMIUM pointing at a chromium binary).
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$DIR")"
PORT="${KT_PORT:-8899}"
export KT_BASE="http://127.0.0.1:${PORT}"

# Full Chromium, never the headless shell — the shell denies the Screen Wake
# Lock API, and the wake-lock check in polish.js is testing real behaviour.
if [ -z "${KT_CHROMIUM:-}" ]; then
  KT_CHROMIUM="$(node -p "require('playwright').chromium.executablePath()" 2>/dev/null || true)"
  [ -x "$KT_CHROMIUM" ] && export KT_CHROMIUM || unset KT_CHROMIUM
fi

# The app is static — any file server over the repo root is the deployment.
python3 -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT

for i in $(seq 1 40); do
  curl -sf -o /dev/null "$KT_BASE/index.html" && break
  sleep 0.25
done

SUITES="${KT_ONLY:-kt feat add relay quick polish sec plan perf zoom contrast}"
FAILED=0
for s in $SUITES; do
  echo
  echo "=========================== $s ==========================="
  if ! node "$DIR/$s.js"; then
    FAILED=1
    echo "SUITE FAILED: $s"
  fi
done

exit "$FAILED"
