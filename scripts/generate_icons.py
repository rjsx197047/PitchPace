#!/usr/bin/env python3
"""Generate the PWA icon set (frontend/public/icons) from the brand mark.

Re-run after changing colors/geometry: python3 scripts/generate_icons.py
Requires Pillow (pip install Pillow).
"""

from pathlib import Path

from PIL import Image, ImageDraw

BG = (9, 9, 11, 255)  # zinc-950, matches the app theme
GREEN = (16, 185, 129, 255)  # emerald-500 brand accent
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"


def draw_mark(img: Image.Image, scale: float, offset: tuple[float, float]) -> None:
    """The double-chevron mark from the favicon, in 24-unit coordinate space."""
    d = ImageDraw.Draw(img)
    u = scale / 24
    ox, oy = offset
    w = max(2, round(2.6 * u))
    r = w / 2
    for x0 in (6, 12):
        pts = [
            (ox + x0 * u, oy + 8 * u),
            (ox + (x0 + 4) * u, oy + 12 * u),
            (ox + x0 * u, oy + 16 * u),
        ]
        d.line(pts, fill=GREEN, width=w, joint="curve")
        for px, py in (pts[0], pts[-1]):  # round line caps
            d.ellipse([px - r, py - r, px + r, py + r], fill=GREEN)


def rounded(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=round(size * 0.22), fill=BG)
    draw_mark(img, size, (0, 0))
    return img


def full_bleed(size: int, content: float = 0.62) -> Image.Image:
    """Square icon with safe-zone padding (maskable / apple-touch)."""
    img = Image.new("RGBA", (size, size), BG)
    inner = size * content
    off = (size - inner) / 2
    draw_mark(img, inner, (off, off))
    return img


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    rounded(192).save(OUT / "icon-192.png")
    rounded(512).save(OUT / "icon-512.png")
    full_bleed(512).save(OUT / "icon-maskable-512.png")
    full_bleed(180, 0.7).convert("RGB").save(OUT / "apple-touch-icon.png")
    print(f"icons written to {OUT}")
