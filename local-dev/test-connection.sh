#!/usr/bin/env bash
#
# test-connection.sh — automated verification of the connection routes.
#
# Spins up the backend on a test port, runs every check, and reports
# PASS/FAIL for each. Exits non-zero if any check fails.
#
# The "wrong password" check targets the real VPS host (reachable but with a
# bogus password) and is skipped automatically if the host is unreachable from
# this machine, so the suite still passes offline.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

PORT=8011
BASE="http://127.0.0.1:$PORT"
# Real VPS host for the optional "wrong password → 401" check.
# Set via env, e.g. `VPS_HOST=1.2.3.4 ./test-connection.sh`; left empty the
# check is skipped. The username can be overridden with VPS_USER (default root).
VPS_HOST="${VPS_HOST:-}"
VPS_USER="${VPS_USER:-root}"

PASS=0
FAIL=0
BACKEND_PID=""

cleanup() {
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# check <name> <expected_http> <actual_http> [expected_substr] [body]
check() {
  local name="$1" want_code="$2" got_code="$3" want_sub="${4:-}" body="${5:-}"
  local ok=true
  [ "$got_code" = "$want_code" ] || ok=false
  if [ -n "$want_sub" ] && [[ "$body" != *"$want_sub"* ]]; then ok=false; fi
  if [ "$ok" = true ]; then
    echo "  PASS  $name (HTTP $got_code)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name — wanted HTTP $want_code${want_sub:+ containing '$want_sub'}, got HTTP $got_code"
    [ -n "$body" ] && echo "        body: $body"
    FAIL=$((FAIL + 1))
  fi
}

# req <method> <path> [json] -> sets RESP_CODE and RESP_BODY
req() {
  local method="$1" path="$2" data="${3:-}"
  local out
  if [ -n "$data" ]; then
    out=$(curl -s -w $'\n%{http_code}' -X "$method" "$BASE$path" \
      -H "Content-Type: application/json" -d "$data")
  else
    out=$(curl -s -w $'\n%{http_code}' -X "$method" "$BASE$path")
  fi
  RESP_CODE="${out##*$'\n'}"
  RESP_BODY="${out%$'\n'*}"
}

echo "==> Preparing backend environment"
cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "==> Starting backend on port $PORT"
uvicorn main:app --host 127.0.0.1 --port "$PORT" >/tmp/vps-manager-test-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for /health.
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "$BASE/health"; then break; fi
  sleep 0.5
done

echo ""
echo "==> Running checks"

# 1. Health probe.
req GET /health
check "health probe" 200 "$RESP_CODE" '"status":"ok"' "$RESP_BODY"

# 2. Status before connecting.
req GET /status
check "status disconnected" 200 "$RESP_CODE" '"connected":false' "$RESP_BODY"

# 3. Disconnect when not connected (idempotent).
req POST /disconnect
check "disconnect idempotent" 200 "$RESP_CODE" '"status":"disconnected"' "$RESP_BODY"

# 4. Validation error: missing fields → 422.
req POST /connect '{"host":"x"}'
check "validation error" 422 "$RESP_CODE"

# 5. Unreachable host → 503 (short wait; 10s connect timeout in client).
req POST /connect '{"host":"10.255.255.1","port":22,"username":"x","password":"x"}'
check "unreachable host → 503" 503 "$RESP_CODE" "unreachable" "$RESP_BODY"

# 6. Wrong password on the real VPS → 401 (skipped if VPS_HOST unset/unreachable).
if [ -n "$VPS_HOST" ] && nc -z -w 3 "$VPS_HOST" 22 2>/dev/null; then
  req POST /connect "{\"host\":\"$VPS_HOST\",\"port\":22,\"username\":\"$VPS_USER\",\"password\":\"definitely-wrong-pw\"}"
  check "wrong password → 401" 401 "$RESP_CODE" "Authentication failed" "$RESP_BODY"
else
  echo "  SKIP  wrong password → 401 (set VPS_HOST=<ip> to enable)"
fi

# 7. Status still disconnected after failed attempts.
req GET /status
check "status still disconnected" 200 "$RESP_CODE" '"connected":false' "$RESP_BODY"

echo ""
echo "==> Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
