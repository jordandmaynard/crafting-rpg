"""Iron chest window (v718): Jordan's painting has 3 x 5 wells, iron chests hold 20, so this adds a fourth row.

The grid (x 124..1000) gets a copy of row 2 with the bars either side (src y 697..870, one 173 px pitch) under row 2,
and the rest moves down. Beside the grid, the chest's walls (frame and lining) from y 520 to 870 are stretched
down over the taller span instead, so they stay one straight slant with no seam or jog; the two meet in the
smooth shading between the lining's crease and the grid, blended over a few px.
Writes ui/ironchest/ironchest-window.webp (q94).

  python3 art/src/iron-chest-rows.py
"""
import numpy as np
from PIL import Image

SRC = 'art/deliveries/iron-chest-window-v1.png'
A, B = 697, 870            # the copied band (bar centre to bar centre)
Y0 = 520                   # where the walls' stretch starts
G, GR, FX = 124, 1000, 6   # the grid's side (between the lining's crease and the wells' frames), and the blend's half-width

src = np.array(Image.open(SRC).convert('RGBA')).astype(np.float64)
src[..., :3] *= src[..., 3:4] / 255.0                      # premultiplied for clean resampling
h, w, _ = src.shape
band = B - A
grid = np.concatenate([src[:B], src[A:B], src[B:]], axis=0)  # the grid's version: the band inserted
END = B + band
walls = grid.copy()
ys = Y0 + (np.arange(Y0, END) - Y0 + 0.5) * (B - Y0) / (END - Y0) - 0.5   # new row -> src row (stretched)
for c in range(4):
    for x in list(range(0, G + FX + 1)) + list(range(GR - FX - 1, w)):
        walls[Y0:END, x, c] = np.interp(ys, np.arange(h), src[:, x, c])
# the grid's columns from the grid version, the walls' from the stretched one, blended between
xs = np.arange(w)
t = np.clip(np.minimum((xs - (G - FX)) / (2 * FX), ((GR + FX) - xs) / (2 * FX)), 0, 1)    # 1 in the grid, 0 on the walls
t = t * t * (3 - 2 * t)
out = walls * (1 - t)[None, :, None] + grid * t[None, :, None]
rgb = np.where(out[..., 3:4] > 0, out[..., :3] * 255.0 / np.maximum(out[..., 3:4], 1e-6), 0)
img = np.concatenate([rgb, out[..., 3:4]], axis=2).clip(0, 255).round().astype(np.uint8)
Image.fromarray(img, 'RGBA').save('ui/ironchest/ironchest-window.webp', quality=94, method=6)
print('wrote', img.shape[1], 'x', img.shape[0])
