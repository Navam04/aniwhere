"""Draw the Aniwhere icons (a map pin with a play button: watch anywhere) into static/icons/."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

out = Path(sys.argv[1] if len(sys.argv) > 1 else "static/icons")
out.mkdir(parents=True, exist_ok=True)
BG, ACCENT = (11, 13, 18), (124, 140, 255)


def draw(size, rounded):
    s = size * 4  # supersample for smooth edges
    img = Image.new("RGBA", (s, s), BG + (255,) if not rounded else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
    # map pin: a circle with a point underneath
    cx, cy, r = s / 2, s * 0.43, s * 0.25
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
    d.polygon([(cx - r * 0.87, cy + r * 0.5), (cx + r * 0.87, cy + r * 0.5), (cx, cy + r * 1.75)], fill=ACCENT)
    # play triangle inside the pin's head
    px, t = cx + r * 0.08, r * 0.42
    d.polygon([(px - t * 0.8, cy - t), (px + t, cy), (px - t * 0.8, cy + t)], fill=BG)
    return img.resize((size, size), Image.LANCZOS)


draw(192, True).save(out / "icon-192.png")
draw(512, False).save(out / "icon-512.png")  # full-bleed so "maskable" crops cleanly
draw(180, False).convert("RGB").save(out / "apple-touch-icon.png")
print("icons written to", out)
