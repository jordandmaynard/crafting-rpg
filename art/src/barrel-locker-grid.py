# (v724, Jordan: barrels in buildings open as loot, a 2x2 grid from the foot locker set inside, the title, count and X
# on the lid) Makes ui/barrel/barrel-window.webp from art/deliveries/barrel-window-v1.png (the open barrel, its lid
# hinged up behind):
#   1. the painting is trimmed to the barrel (a 12 px margin round it; the background stays clear, so the window's drop
#      shadow follows the barrel's outline);
#   2. a 2x2 piece of the foot locker's grid (ui/locker/locker-window.webp, already matched to the crate:
#      art/src/foot-locker-match.py), its first and last columns and top and bottom rows joined at the middle of the
#      bars between, is scaled to the foot locker window's on-screen size (0.56 of its painting) at this window's
#      scale (BK) and laid in the middle of the barrel's floor, with a soft shadow under it;
#   3. its hue is moved (Lab a and b means) to the barrel floor's, its lightness kept.
#   python3 art/src/barrel-locker-grid.py
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

def srgb2lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin2srgb(c): return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)
M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]); Mi = np.linalg.inv(M)
WP = np.array([0.95047, 1.0, 1.08883])
def f(t): return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
def fi(t): return np.where(t > 0.206893, t ** 3, (t - 16 / 116) / 7.787)
def rgb2lab(rgb):
    fx = f(srgb2lin(rgb) @ M.T / WP)
    return np.stack([116 * fx[..., 1] - 16, 500 * (fx[..., 0] - fx[..., 1]), 200 * (fx[..., 1] - fx[..., 2])], -1)
def lab2rgb(lab):
    fy = (lab[..., 0] + 16) / 116; fx = fy + lab[..., 1] / 500; fz = fy - lab[..., 2] / 200
    return np.clip(lin2srgb((np.stack([fi(fx), fi(fy), fi(fz)], -1) * WP) @ Mi.T), 0, 1)

BK = 0.53                  # the window's on-screen scale (css px per painting px): #storeCol.barrel --bk
LK = 0.56                  # the foot locker window's (LOCKER_UI.scale), so the squares come out the same size
FLOOR = (523, 957)         # the middle of the barrel's floor in the delivered painting

src = np.asarray(Image.open('art/deliveries/barrel-window-v1.png').convert('RGBA')).astype(float) / 255
ys, xs = np.where(src[..., 3] > 0.04)
X0, Y0 = max(xs.min() - 12, 0), max(ys.min() - 12, 0)
X1, Y1 = min(xs.max() + 13, src.shape[1]), min(ys.max() + 13, src.shape[0])
c = src[Y0:Y1, X0:X1].copy()
fx, fy = FLOOR[0] - X0, FLOOR[1] - Y0

# the locker's 2x2: columns 1 and 5 (frame edges 138 and 1060, bars' middles 326 and 873), rows 1 and 3 (frame edges
# 526 and 1097, bars' middles 718 and 902)
locker = np.asarray(Image.open('ui/locker/locker-window.webp').convert('RGBA')).astype(float) / 255
cols = lambda a: np.concatenate([a[:, 138:326], a[:, 873:1060]], axis=1)
part = cols(np.concatenate([locker[526:718], locker[902:1097]], axis=0))
PW, PH = part.shape[1], part.shape[0]
s = LK / BK
NW, NH = round(PW * s), round(PH * s)
g = np.asarray(Image.fromarray((part * 255 + 0.5).astype(np.uint8), 'RGBA').resize((NW, NH), Image.LANCZOS)).astype(float) / 255
gx, gy = round(fx - NW / 2), round(fy - NH / 2)

# hue to the floor's
floor = c[fy - 150:fy + 150, fx - 220:fx + 220, :3]
lab_g, lab_f = rgb2lab(g[..., :3]), rgb2lab(floor)
d = lab_f.reshape(-1, 3).mean(0) - lab_g.reshape(-1, 3).mean(0); d[0] = 0
g[..., :3] = lab2rgb(lab_g + d)

# a soft shadow on the floor round and under the grid (light from above and a little in front)
sh = np.zeros(c.shape[:2])
sh[gy + 6:gy + NH + 10, gx + 2:gx + NW - 2] = 1
sh = gaussian_filter(sh, 9) * 0.55
c[..., :3] *= (1 - sh)[..., None]

# laid in with a 2 px feather at its edges
yy, xx = np.mgrid[0:NH, 0:NW]
edge = np.minimum.reduce([xx + 0.5, NW - xx - 0.5, yy + 0.5, NH - yy - 0.5])
a = np.clip(edge / 2, 0, 1)[..., None]
c[gy:gy + NH, gx:gx + NW, :3] = c[gy:gy + NH, gx:gx + NW, :3] * (1 - a) + g[..., :3] * a

os.makedirs('ui/barrel', exist_ok=True)
out = (np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(out, 'RGBA').save('ui/barrel/barrel-window.webp', 'WEBP', quality=94, method=6)
# the squares (css px, at BK): the locker's wells sit 16/198 px in and 18/202 px down in the joined piece
r1 = lambda v: round(v, 1)
print('barrel window', out.shape[1], 'x', out.shape[0], '=', r1(out.shape[1] * BK), 'x', r1(out.shape[0] * BK), 'css; trim at', X0, Y0,
      '; grid at', gx, gy, NW, 'x', NH,
      '; wells css left', [r1((gx + x * s) * BK) for x in (16, 198)], 'top', [r1((gy + y * s) * BK) for y in (18, 202)],
      'size', r1(161 * LK), r1(164 * LK))
