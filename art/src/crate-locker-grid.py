# (v723, Jordan: the crate's squares wider than tall, unlike every other square in the game) Remakes
# ui/crate/crate-window.webp from the crate kit's 2x painting with the foot locker's square wells:
#   1. a 290 px column and a 74 px row are cut from the middle of the crate (its planks run straight through there),
#      each where its two sides' grain matches best, cross-faded over 40 px, so it closes up round the narrower,
#      slightly shorter grid;
#   2. the foot locker's grid (ui/locker/locker-window.webp, already matched to the crate: art/src/foot-locker-match.py),
#      its top row and bottom row joined (two rows of five), is scaled to the locker window's on-screen size (0.56 of
#      its painting, x2 for this 2x painting) and laid over where the crate's own grid was;
#   3. that grid's colours are moved (Lab mean/spread) to the crate's own grid's, so the bars and wells sit in its wood.
#   python3 art/src/crate-locker-grid.py
import io, zipfile
import numpy as np
from PIL import Image

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

with zipfile.ZipFile('art/deliveries/wanderers-kit-crate-v1.zip') as z:
    crate = np.asarray(Image.open(io.BytesIO(z.read('wanderers-kit-crate-v1/assets/crate-window-normal@2x.png'))).convert('RGBA')).astype(float) / 255
locker = np.asarray(Image.open('ui/locker/locker-window.webp').convert('RGBA')).astype(float) / 255

# the crate's grid (outer edges of its frame, 2x px) and the cut through its middle
GX0, GX1, GY0, GY1 = 178, 1500, 265, 772
CX, CW, CY, CH = 840, 290, 519, 74
old_grid = crate[GY0:GY1, GX0:GX1].copy()
def cut(img, axis, mid, n, B=20, search=60):
    # cut n px out near mid, where the two sides' edges look most alike (outside the grid), cross-faded over 2B px
    a = np.moveaxis(img, axis, 0)
    other = np.ones(a.shape[1], bool)
    lo, hi = (GY0, GY1) if axis == 1 else (GX0, GX1)
    other[lo:hi] = False                                    # the grid's span along the cut doesn't count
    best = min(range(mid - n // 2 - search, mid - n // 2 + search + 1),
               key=lambda s0: ((a[s0 - B:s0 + B, other, :3] - a[s0 + n - B:s0 + n + B, other, :3]) ** 2).sum())
    t = np.linspace(0, 1, 2 * B)[:, None, None]; t = t * t * (3 - 2 * t)
    fade = a[best - B:best + B] * (1 - t) + a[best + n - B:best + n + B] * t
    out = np.concatenate([a[:best - B], fade, a[best + n + B:]], axis=0)
    return np.moveaxis(out, 0, axis), best
c, sx = cut(crate, 1, CX, CW)
c, sy = cut(c, 0, CY, CH)
print('cuts at x', sx, 'y', sy)
NX0, NY0, NW, NH = GX0, GY0, GX1 - GX0 - CW, GY1 - GY0 - CH

# the locker's grid: frame edges x 138..1060, rows 1 and 3 (top part to the bar under row 1, from the bar over row 3)
LX0, LX1 = 138, 1060
part = np.concatenate([locker[526:718, LX0:LX1], locker[902:1097, LX0:LX1]], axis=0)
img = Image.fromarray((part * 255 + 0.5).astype(np.uint8), 'RGBA').resize((NW, NH), Image.LANCZOS)
g = np.asarray(img).astype(float) / 255
# colours to the crate grid's
lab_g, lab_o = rgb2lab(g[..., :3]), rgb2lab(old_grid[..., :3])
mg, sg = lab_g.reshape(-1, 3).mean(0), lab_g.reshape(-1, 3).std(0)
mo, so = lab_o.reshape(-1, 3).mean(0), lab_o.reshape(-1, 3).std(0)
g[..., :3] = lab2rgb((lab_g - mg) * (so / sg) + mo)
# laid in with a 3 px feather at its edges
yy, xx = np.mgrid[0:NH, 0:NW]
edge = np.minimum.reduce([xx + 0.5, NW - xx - 0.5, yy + 0.5, NH - yy - 0.5])
a = np.clip(edge / 3, 0, 1)[..., None]
c[NY0:NY0 + NH, NX0:NX0 + NW, :3] = c[NY0:NY0 + NH, NX0:NX0 + NW, :3] * (1 - a) + g[..., :3] * a
out = (np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(out, 'RGBA').save('ui/crate/crate-window.webp', 'WEBP', quality=94, method=6)
print('crate window', out.shape[1], 'x', out.shape[0], '; grid at', NX0, NY0, NW, 'x', NH,
      '; wells (1x css):', [round((NX0 + (x - LX0) * NW / (LX1 - LX0)) / 2, 1) for x in (154, 337, 519, 701, 883)],
      [round((NY0 + y * NH / 387) / 2, 1) for y in (544 - 526, 192 + 912 - 902)], 'size', round(161 * NW / (LX1 - LX0) / 2, 2), round(164 * NH / 387 / 2, 2))
