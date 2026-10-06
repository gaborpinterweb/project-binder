#!/usr/bin/env python3
"""Build desktop icons from assets/logo-tactile.png with transparent corners."""

from collections import deque
from pathlib import Path
import math
import shutil
import subprocess
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "logo-tactile.png"
OUT_PNG = ROOT / "assets" / "icon.png"
OUT_ICO = ROOT / "assets" / "icon.ico"
OUT_ICNS = ROOT / "assets" / "icon.icns"

BG_THRESHOLD = 12
ICON_SIZE = 1024
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ICNS_SIZES = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}


def color_dist(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def clear_outer_background(im):
    w, h = im.size
    px = im.load()
    bg = px[0, 0][:3]
    seen = bytearray(w * h)
    q = deque()

    def enqueue(x, y):
        i = y * w + x
        if seen[i]:
            return
        seen[i] = 1
        q.append((x, y))

    for x in range(w):
        enqueue(x, 0)
        enqueue(x, h - 1)
    for y in range(h):
        enqueue(0, y)
        enqueue(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, _a = px[x, y]
        if color_dist((r, g, b), bg) >= BG_THRESHOLD:
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < w:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < h:
            enqueue(x, y + 1)
    return im


def crop_to_opaque(im, pad_ratio=0.02):
    bbox = im.getbbox()
    if not bbox:
        raise SystemExit("icon became fully transparent")
    left, top, right, bottom = bbox
    side = max(right - left, bottom - top)
    pad = int(side * pad_ratio)
    side += pad * 2
    cx = (left + right) // 2
    cy = (top + bottom) // 2
    x0 = max(0, cx - side // 2)
    y0 = max(0, cy - side // 2)
    x1 = min(im.width, x0 + side)
    y1 = min(im.height, y0 + side)
    x0 = max(0, x1 - side)
    y0 = max(0, y1 - side)
    return im.crop((x0, y0, x1, y1))


def main():
    im = Image.open(SRC).convert("RGBA")
    im = clear_outer_background(im)
    im = crop_to_opaque(im)
    icon = im.resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS)
    icon.save(OUT_PNG, "PNG")

    icon.save(OUT_ICO, sizes=ICO_SIZES)

    if shutil.which("iconutil"):
        with tempfile.TemporaryDirectory() as tmp:
            iconset = Path(tmp) / "icon.iconset"
            iconset.mkdir()
            for name, size in ICNS_SIZES.items():
                icon.resize((size, size), Image.Resampling.LANCZOS).save(iconset / name, "PNG")
            subprocess.check_call(["iconutil", "-c", "icns", "-o", str(OUT_ICNS), str(iconset)])
    else:
        print("iconutil not found; skipped", OUT_ICNS.name)

    print("wrote", OUT_PNG.relative_to(ROOT))
    print("wrote", OUT_ICO.relative_to(ROOT))
    if OUT_ICNS.exists():
        print("wrote", OUT_ICNS.relative_to(ROOT))


if __name__ == "__main__":
    main()
