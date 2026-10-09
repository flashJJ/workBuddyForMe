#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate all Windows/web app icons from one source artwork.

Input : apps/desktop/build/source/icon-source.png (RGB, full-bleed artwork)
Output: apps/desktop/build/icon.ico                 (exe + NSIS + uninstaller)
        apps/desktop/build/installerSidebar.bmp     (164x314 NSIS sidebar)
        apps/desktop/build/icons/{128,256,512}.png
        apps/web/public/favicon.ico                 (16/32/48)

Idempotent: rerunning produces byte-identical files.
Requires: Pillow (pip install --user pillow)
"""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent          # apps/desktop/scripts
BUILD = HERE.parent / "build"
SOURCE = BUILD / "source" / "icon-source.png"
ICONS_DIR = BUILD / "icons"
WEB_PUBLIC = HERE.parent.parent / "web" / "public"

# Tight square around the mascot + three workflow nodes (excludes the loose
# glow dots in the upper-left). Format: (left, top, right, bottom), tuned
# against the 636x612 source artwork; body coverage ~88%.
CROP_BOX = (64, 52, 572, 560)

ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
FAVICON_SIZES = [16, 32, 48]
SIDEBAR_SIZE = (164, 314)


def load_square_base() -> Image.Image:
    src = Image.open(SOURCE).convert("RGB")
    left, top, right, bottom = CROP_BOX
    side = right - left
    assert bottom - top == side, f"CROP_BOX must be square, got {CROP_BOX}"
    assert right <= src.width and bottom <= src.height, "CROP_BOX outside image"
    return src.crop(CROP_BOX)


def save_ico(base: Image.Image, path: Path, sizes: list[int]) -> None:
    # Pillow derives every frame from the single base image via `sizes`;
    # passing append_images alongside it silently drops all but one frame.
    path.parent.mkdir(parents=True, exist_ok=True)
    base.save(path, format="ICO", sizes=[(s, s) for s in sizes])


def save_sidebar(base: Image.Image) -> None:
    # Center vertical strip at the NSIS sidebar aspect (164:314), then resize.
    target_ratio = SIDEBAR_SIZE[0] / SIDEBAR_SIZE[1]
    strip_w = round(base.height * target_ratio)
    left = (base.width - strip_w) // 2
    strip = base.crop((left, 0, left + strip_w, base.height))
    strip.resize(SIDEBAR_SIZE, Image.LANCZOS).save(
        BUILD / "installerSidebar.bmp", format="BMP"
    )


def save_png_set(base: Image.Image) -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    for size in (128, 256, 512):
        base.resize((size, size), Image.LANCZOS).save(
            ICONS_DIR / f"{size}x{size}.png", format="PNG"
        )


def main() -> None:
    base = load_square_base()
    save_ico(base, BUILD / "icon.ico", ICO_SIZES)
    save_ico(base, WEB_PUBLIC / "favicon.ico", FAVICON_SIZES)
    save_sidebar(base)
    save_png_set(base)
    print("icons generated:", BUILD / "icon.ico", "| favicon | sidebar | png-set")


if __name__ == "__main__":
    main()
