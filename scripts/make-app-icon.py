#!/usr/bin/env python3
"""Build desktop icons from assets/logo-transparent.png on a solid brown square.

macOS applies its own squircle mask. Do not pre-round the artwork; fill the
canvas so the OS clips a single shape.
"""

from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "logo-transparent.png"
TACTILE = ROOT / "assets" / "logo-tactile.png"
OUT_PNG = ROOT / "assets" / "icon.png"
OUT_ICO = ROOT / "assets" / "icon.ico"
OUT_ICNS = ROOT / "assets" / "icon.icns"

ICON_SIZE = 1024
# Folder scale vs canvas; remaining margin is clipped by the system squircle.
FILL = 0.76
ALPHA_CROP = 24
# Fallback if the tactile source is missing; matches the inner plate.
BG_FALLBACK = (42, 27, 19)
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


def inner_plate_color():
    if not TACTILE.exists():
        return BG_FALLBACK
    tact = Image.open(TACTILE).convert("RGB")
    w, h = tact.size
    samples = []
    # Inner plate, away from the outer canvas and the folder.
    for nx, ny in (
        (0.22, 0.22),
        (0.78, 0.22),
        (0.28, 0.22),
        (0.72, 0.22),
        (0.50, 0.21),
    ):
        samples.append(tact.getpixel((int(w * nx), int(h * ny))))
    return tuple(sum(ch) // len(samples) for ch in zip(*samples))


def crop_artwork(im):
    alpha = im.getchannel("A")
    bbox = alpha.point(lambda a: 255 if a > ALPHA_CROP else 0).getbbox()
    if not bbox:
        raise SystemExit("transparent logo has no visible pixels")
    return im.crop(bbox)


def compose():
    art = crop_artwork(Image.open(SRC).convert("RGBA"))
    bg_rgb = inner_plate_color()
    canvas = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), bg_rgb + (255,))

    max_side = int(ICON_SIZE * FILL)
    scale = min(max_side / art.width, max_side / art.height)
    size = (max(1, round(art.width * scale)), max(1, round(art.height * scale)))
    art = art.resize(size, Image.Resampling.LANCZOS)
    x = (ICON_SIZE - art.width) // 2
    y = (ICON_SIZE - art.height) // 2
    canvas.alpha_composite(art, (x, y))
    return canvas, bg_rgb


def main():
    icon, bg_rgb = compose()
    icon.save(OUT_PNG, "PNG")
    icon.convert("RGB").save(OUT_ICO, sizes=ICO_SIZES)

    if shutil.which("iconutil"):
        with tempfile.TemporaryDirectory() as tmp:
            iconset = Path(tmp) / "icon.iconset"
            iconset.mkdir()
            for name, size in ICNS_SIZES.items():
                icon.resize((size, size), Image.Resampling.LANCZOS).save(iconset / name, "PNG")
            subprocess.check_call(["iconutil", "-c", "icns", "-o", str(OUT_ICNS), str(iconset)])
    else:
        print("iconutil not found; skipped", OUT_ICNS.name)

    print("bg", bg_rgb)
    print("wrote", OUT_PNG.relative_to(ROOT))
    print("wrote", OUT_ICO.relative_to(ROOT))
    if OUT_ICNS.exists():
        print("wrote", OUT_ICNS.relative_to(ROOT))


if __name__ == "__main__":
    main()
