"""Generate a simple 1024x1024 placeholder PNG app icon using only the stdlib
(no Pillow). Draws a dark rounded panel with two "server slot" stripes and an
emerald status dot — a minimal stand-in until a real icon is designed.

Usage: python3 make-icon.py <output.png>
"""

import struct
import sys
import zlib

W = H = 1024
BG = (15, 23, 42, 255)        # slate-900
PANEL = (30, 41, 59, 255)     # slate-800
SLOT = (2, 6, 23, 255)        # near-black
DOT = (16, 185, 129, 255)     # emerald-500


def in_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x >= x1 or y < y0 or y >= y1:
        return False
    # Rounded corners.
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= r * r or (x0 + r <= x < x1 - r) or (y0 + r <= y < y1 - r)


def pixel(x, y):
    # Centered rounded panel.
    if in_round_rect(x, y, 224, 224, 800, 800, 80):
        # Two slots.
        if 300 <= x < 724 and (360 <= y < 430 or 500 <= y < 570):
            return SLOT
        # Status dot on the lower slot.
        if (x - 350) ** 2 + (y - 640) ** 2 <= 28 ** 2:
            return DOT
        return PANEL
    return BG


def main(out_path):
    raw = bytearray()
    for y in range(H):
        raw.append(0)  # PNG filter type 0 (none) per scanline
        for x in range(W):
            raw += bytes(pixel(x, y))

    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", compressed)
    png += chunk(b"IEND", b"")

    with open(out_path, "wb") as f:
        f.write(png)
    print(f"Wrote {out_path} ({W}x{H})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "icon-1024.png")
