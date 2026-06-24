#!/usr/bin/env bash
#
# make-icon.sh — generate electron/build/icon.icns from a placeholder PNG.
# Uses macOS `sips` + `iconutil` (no third-party tools).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$ROOT_DIR/electron/build"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$BUILD_DIR"

PNG="$TMP/icon-1024.png"
python3 "$SCRIPT_DIR/make-icon.py" "$PNG"

ICONSET="$TMP/icon.iconset"
mkdir -p "$ICONSET"

# Standard macOS iconset sizes (1x and 2x).
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" "$PNG" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z "$d" "$d" "$PNG" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o "$BUILD_DIR/icon.icns"
echo "==> Wrote $BUILD_DIR/icon.icns"
