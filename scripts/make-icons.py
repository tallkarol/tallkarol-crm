#!/usr/bin/env python3
"""
Generates the PWA icon set for the clock app.

No image library is available on this machine, so this writes PNGs directly:
supersample a vector-ish description 4x, box-filter it down for smooth edges,
then deflate it into a PNG. Re-run with `python3 scripts/make-icons.py` after
changing the mark.
"""

import math
import struct
import zlib
from pathlib import Path

TEAL = (0x00, 0x69, 0x65)
LINEN = (0xF1, 0xEA, 0xDC)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"

SS = 4  # supersampling factor


def rounded_rect_alpha(x, y, w, h, radius):
    """1 inside a rounded rectangle spanning 0..w, 0..h."""
    cx = min(max(x, radius), w - radius)
    cy = min(max(y, radius), h - radius)
    dx, dy = x - cx, y - cy
    return 1.0 if dx * dx + dy * dy <= radius * radius else 0.0


def ring_alpha(x, y, cx, cy, outer, inner):
    d = math.hypot(x - cx, y - cy)
    return 1.0 if inner <= d <= outer else 0.0


def hand_alpha(x, y, cx, cy, angle_deg, length, width):
    """A rounded line from the centre out along `angle_deg` (0 = 12 o'clock)."""
    rad = math.radians(angle_deg - 90)
    ex, ey = cx + math.cos(rad) * length, cy + math.sin(rad) * length
    vx, vy = ex - cx, ey - cy
    seg = vx * vx + vy * vy
    if seg == 0:
        return 0.0
    t = max(0.0, min(1.0, ((x - cx) * vx + (y - cy) * vy) / seg))
    px, py = cx + vx * t, cy + vy * t
    return 1.0 if math.hypot(x - px, y - py) <= width / 2 else 0.0


def render(size, maskable=False):
    """RGBA pixel rows for one icon."""
    big = size * SS
    # A maskable icon must survive a circular crop, so the mark sits smaller.
    scale = 0.58 if maskable else 0.74
    cx = cy = big / 2
    outer = big * scale / 2
    inner = outer - big * (0.055 if maskable else 0.07)
    corner = big * (0.5 if maskable else 0.235)

    hi = [[(0, 0, 0, 0)] * big for _ in range(big)]
    for py in range(big):
        for px in range(big):
            x, y = px + 0.5, py + 0.5
            if rounded_rect_alpha(x, y, big, big, corner) == 0.0:
                continue
            mark = ring_alpha(x, y, cx, cy, outer, inner)
            if mark == 0.0:
                # 10:08 — the angle every watch face is photographed at.
                mark = max(
                    hand_alpha(x, y, cx, cy, 300, outer * 0.52, big * 0.055),
                    hand_alpha(x, y, cx, cy, 48, outer * 0.68, big * 0.055),
                )
            hi[py][px] = LINEN + (255,) if mark > 0 else TEAL + (255,)

    # Box-filter down: this is where the edges get their smoothness.
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    pr, pg, pb, pa = hi[y * SS + sy][x * SS + sx]
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
            n = SS * SS
            if a == 0:
                row += bytes((0, 0, 0, 0))
            else:
                row += bytes((round(r / a), round(g / a), round(b / a), round(a / n)))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"{path.name}  {len(png):,} bytes")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (32, 180, 192, 512):
        write_png(OUT / f"clock-{size}.png", size, render(size))
    write_png(OUT / "clock-maskable-512.png", 512, render(512, maskable=True))


if __name__ == "__main__":
    main()
