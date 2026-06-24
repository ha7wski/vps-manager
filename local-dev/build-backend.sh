#!/usr/bin/env bash
#
# build-backend.sh — freeze the FastAPI backend into a self-contained
# executable with PyInstaller, so the packaged app needs no system Python.
#
# Output (one-dir bundle):
#   electron/backend-build/dist/vps-manager-backend/vps-manager-backend
# which electron-builder copies into the .app under Contents/Resources/backend.
#
# NOTE: PyInstaller does NOT cross-compile. The produced binary matches the
# CPU architecture of THIS machine. To ship both arm64 and x64 backends, run
# this script once on each architecture (an Intel mac or `arch -x86_64` under
# Rosetta with an x86_64 Python).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ELECTRON_DIR="$ROOT_DIR/electron"
OUT_DIR="$ELECTRON_DIR/backend-build"

cd "$BACKEND_DIR"

# Use a dedicated build venv so PyInstaller + deps don't pollute the dev venv.
if [ ! -d ".venv-build" ]; then
  echo "==> Creating build virtualenv (.venv-build)"
  python3 -m venv .venv-build
fi
# shellcheck disable=SC1091
source .venv-build/bin/activate

echo "==> Installing backend dependencies + PyInstaller"
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
pip install --quiet "pyinstaller>=6.6.0"

echo "==> Freezing backend with PyInstaller ($(uname -m))"
rm -rf "$OUT_DIR/dist" "$OUT_DIR/work"
pyinstaller --noconfirm --clean \
  --name vps-manager-backend \
  --distpath "$OUT_DIR/dist" \
  --workpath "$OUT_DIR/work" \
  --specpath "$OUT_DIR" \
  --collect-submodules uvicorn \
  --collect-submodules websockets \
  --collect-submodules wsproto \
  --collect-all paramiko \
  --hidden-import uvicorn.lifespan.on \
  --hidden-import uvicorn.protocols.http.h11_impl \
  --hidden-import uvicorn.protocols.websockets.websockets_impl \
  --hidden-import uvicorn.loops.asyncio \
  run_server.py

echo "==> Backend bundled at: $OUT_DIR/dist/vps-manager-backend/vps-manager-backend"
