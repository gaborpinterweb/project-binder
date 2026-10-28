#!/usr/bin/env python3
"""Build web + desktop icons from assets/logo-transparent.png.

Source is a complete framed icon plate (dark frame + paper + mark) with
transparent corners. Favicon / in-app PNGs keep transparency. PWA install
icons and desktop icons are composited onto a solid frame-edge fill so the
OS squircle mask clips one continuous shape (no gray halo).
"""

from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "logo-transparent.png"
OUT_PNG = ROOT / "assets" / "icon.png"
OUT_ICO = ROOT / "assets" / "icon.ico"
OUT_ICNS = ROOT / "assets" / "icon.icns"
PUBLIC = ROOT / "public"
OUT_FAVICON = PUBLIC / "favicon.ico"
OUT_APP_ICON = PUBLIC / "app-icon.png"
OUT_APPLE_TOUCH = PUBLIC / "apple-touch-icon.png"
OUT_ICON_192 = PUBLIC / "icon-192.png"
OUT_ICON_512 = PUBLIC / "icon-512.png"

ICON_SIZE = 1024
# Nearly fill the canvas; leftover rim is frame-colored for OS masking.
FILL = 0.98
# PWA maskable icons: slight overscale so the textured frame bleeds past the
# canvas edge (no solid-fill rim outside the black border).
MASKABLE_FILL = 1.04
ALPHA_CROP = 16
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


def clean_fringe(im):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and a < 40 and (r + g + b) < 90:
                px[x, y] = (0, 0, 0, 0)
    return im


def crop_artwork(im):
    alpha = im.getchannel("A")
    bbox = alpha.point(lambda a: 255 if a > ALPHA_CROP else 0).getbbox()
    if not bbox:
        raise SystemExit("transparent logo has no visible pixels")
    pad = 6
    l, t, r, b = bbox
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(im.width, r + pad), min(im.height, b + pad)
    side = max(r - l, b - t)
    cx, cy = (l + r) // 2, (t + b) // 2
    half = side // 2
    sl = max(0, min(im.width - side, cx - half))
    st = max(0, min(im.height - side, cy - half))
    return im.crop((sl, st, sl + side, st + side))


def frame_fill_color(plate):
    sw = plate.size[0]
    samples = [
        plate.getpixel((int(sw * 0.08), int(sw * 0.5))),
        plate.getpixel((int(sw * 0.5), int(sw * 0.08))),
        plate.getpixel((int(sw * 0.92), int(sw * 0.5))),
        plate.getpixel((int(sw * 0.5), int(sw * 0.92))),
    ]
    opaque = [c[:3] for c in samples if c[3] > 200]
    if not opaque:
        return (28, 24, 22)
    return tuple(sum(ch) // len(opaque) for ch in zip(*opaque))


def resize(im, size):
    return im.resize((size, size), Image.Resampling.LANCZOS)


def compose_filled(plate, bg_rgb, size, fill_ratio):
    canvas = Image.new("RGBA", (size, size), bg_rgb + (255,))
    fill = max(1, int(round(size * fill_ratio)))
    art = resize(plate, fill)
    x = (size - art.width) // 2
    y = (size - art.height) // 2
    canvas.alpha_composite(art, (x, y))
    return Image.alpha_composite(Image.new("RGBA", canvas.size, bg_rgb + (255,)), canvas)


def main():
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")

    plate = crop_artwork(clean_fringe(Image.open(SRC).convert("RGBA")))
    plate_1024 = resize(plate, ICON_SIZE)
    plate_1024.save(SRC, "PNG", optimize=True)

    bg_rgb = frame_fill_color(plate)

    PUBLIC.mkdir(parents=True, exist_ok=True)
    resize(plate, 256).save(OUT_APP_ICON, "PNG", optimize=True)
    compose_filled(plate, bg_rgb, 180, MASKABLE_FILL).save(OUT_APPLE_TOUCH, "PNG", optimize=True)
    compose_filled(plate, bg_rgb, 192, MASKABLE_FILL).save(OUT_ICON_192, "PNG", optimize=True)
    compose_filled(plate, bg_rgb, 512, MASKABLE_FILL).save(OUT_ICON_512, "PNG", optimize=True)
    plate_1024.save(OUT_FAVICON, format="ICO", sizes=ICO_SIZES)

    desktop = compose_filled(plate, bg_rgb, ICON_SIZE, FILL)
    desktop.save(OUT_PNG, "PNG", optimize=True)
    desktop.convert("RGB").save(OUT_ICO, sizes=ICO_SIZES)

    if shutil.which("iconutil"):
        with tempfile.TemporaryDirectory() as tmp:
            iconset = Path(tmp) / "icon.iconset"
            iconset.mkdir()
            for name, size in ICNS_SIZES.items():
                resize(desktop, size).save(iconset / name, "PNG")
            subprocess.check_call(["iconutil", "-c", "icns", "-o", str(OUT_ICNS), str(iconset)])
    else:
        print("iconutil not found; skipped", OUT_ICNS.name)

    print("bg", bg_rgb)
    print("wrote", OUT_PNG.relative_to(ROOT))
    print("wrote", OUT_ICO.relative_to(ROOT))
    print("wrote", OUT_FAVICON.relative_to(ROOT))
    print("wrote", OUT_APP_ICON.relative_to(ROOT))
    print("wrote", OUT_APPLE_TOUCH.relative_to(ROOT))
    print("wrote", OUT_ICON_192.relative_to(ROOT))
    print("wrote", OUT_ICON_512.relative_to(ROOT))
    if OUT_ICNS.exists():
        print("wrote", OUT_ICNS.relative_to(ROOT))


if __name__ == "__main__":
    main()
