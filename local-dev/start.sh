#!/usr/bin/env bash
#
# start.sh — launch the full VPS Manager app for local development.
#
# Starts three processes:
#   1. FastAPI backend  (uvicorn, default port 8000)
#   2. Vite dev server  (frontend, default port 5173)
#   3. Electron shell    (loads the Vite URL)
#
# Ports are chosen dynamically: if the default port is already in use (e.g. you
# have other projects running), the next free port is picked automatically —
# existing processes are never killed. The chosen ports are propagated to the
# backend, Vite, Electron and the frontend so everything stays in sync.
#
# Dependencies are installed on first run. Press Ctrl+C to stop everything.
#
# Usage:
#   ./local-dev/start.sh            # backend + frontend + electron
#   ./local-dev/start.sh --no-electron   # backend + frontend only
#   ./local-dev/start.sh --backend-only  # backend only
#
# Override the starting port with env vars: BACKEND_PORT=9000 ./local-dev/start.sh

set -euo pipefail

# Resolve the project root (this script lives in <root>/local-dev).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ELECTRON_DIR="$ROOT_DIR/electron"

RUN_ELECTRON=true
RUN_FRONTEND=true

for arg in "$@"; do
  case "$arg" in
    --no-electron) RUN_ELECTRON=false ;;
    --backend-only) RUN_ELECTRON=false; RUN_FRONTEND=false ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# Track child PIDs so we can clean them up on exit.
PIDS=()
# PID of the Electron process, if launched — the script's lifetime is tied to it.
ELECTRON_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# True if a TCP port already has a listener.
port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

# Print the first free TCP port at or above the given starting port.
find_free_port() {
  local port="$1"
  while port_in_use "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

# --- Resolve ports -----------------------------------------------------------

echo "==> Resolving free ports"
BACKEND_PORT="$(find_free_port "${BACKEND_PORT:-8000}")"
echo "    Backend  -> $BACKEND_PORT"
if [ "$RUN_FRONTEND" = true ]; then
  FRONTEND_PORT="$(find_free_port "${FRONTEND_PORT:-5173}")"
  echo "    Frontend -> $FRONTEND_PORT"
fi

# --- 1. Backend --------------------------------------------------------------

echo "==> Setting up backend"
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  echo "    Creating virtualenv (.venv)"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "    Installing Python dependencies"
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "    Starting uvicorn on 127.0.0.1:$BACKEND_PORT"
# Auto-reload is OFF by default: on an iCloud/Dropbox-synced folder the sync
# re-touches files and would restart the backend constantly, dropping the live
# SSH session. Enable it explicitly with RELOAD=1 when editing backend code.
RELOAD_FLAG=""
if [ "${RELOAD:-0}" = "1" ]; then
  RELOAD_FLAG="--reload"
  echo "    (auto-reload enabled)"
fi
# shellcheck disable=SC2086
uvicorn main:app $RELOAD_FLAG --host 127.0.0.1 --port "$BACKEND_PORT" &
PIDS+=($!)

# --- 2. Frontend -------------------------------------------------------------

if [ "$RUN_FRONTEND" = true ]; then
  echo "==> Setting up frontend"
  cd "$FRONTEND_DIR"
  if [ ! -d "node_modules" ]; then
    echo "    Installing npm dependencies (frontend)"
    npm install
  fi
  echo "    Starting Vite dev server on localhost:$FRONTEND_PORT"
  # VITE_BACKEND_PORT lets the frontend reach the backend in browser-only mode
  # (no Electron preload). --port pins Vite to the chosen free port.
  VITE_BACKEND_PORT="$BACKEND_PORT" npm run dev -- --port "$FRONTEND_PORT" --strictPort &
  PIDS+=($!)
fi

# --- 3. Electron -------------------------------------------------------------

if [ "$RUN_ELECTRON" = true ]; then
  echo "==> Setting up Electron"
  cd "$ELECTRON_DIR"
  if [ ! -d "node_modules" ]; then
    echo "    Installing npm dependencies (electron)"
    npm install
  fi
  echo "    Waiting for Vite dev server..."
  for _ in $(seq 1 30); do
    if curl -s -o /dev/null "http://localhost:$FRONTEND_PORT"; then break; fi
    sleep 1
  done
  echo "    Launching Electron (backend port $BACKEND_PORT, frontend port $FRONTEND_PORT)"
  # Tell Electron which Vite URL to load and which backend port to use; the
  # backend is already running here, so skip Electron's own backend spawn.
  ELECTRON_START_URL="http://localhost:$FRONTEND_PORT" \
    VPS_BACKEND_PORT="$BACKEND_PORT" \
    VPS_SKIP_BACKEND=1 \
    npm run dev &
  ELECTRON_PID=$!
  PIDS+=("$ELECTRON_PID")
fi

echo ""
if [ -n "$ELECTRON_PID" ]; then
  # Tie the script's lifetime to the Electron window: when the app is closed,
  # this wait returns and the EXIT trap tears down the backend and Vite. Ctrl+C
  # works the same way via the INT trap.
  echo "All processes started. Close the app window or press Ctrl+C to stop."
  wait "$ELECTRON_PID" || true
else
  # No Electron (--no-electron / --backend-only): keep running until interrupted.
  echo "All processes started. Press Ctrl+C to stop."
  wait
fi
