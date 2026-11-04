# (v720, Jordan: a painted foot locker's window takes its paint) Makes ui/locker/locker-wood-mask.webp from the kit's
# source painting: white over everything that takes the paint (wood, wells, the blanket), clear over the metal (the
# iron corner brackets and lid straps, the brass hinges and rivets). The game lays the locker's paint colour over the
# window through this mask with mix-blend-mode: color (the painting's lightness, the paint's hue and saturation).
#   python3 art/src/foot-locker-wood-mask.py      (needs numpy, scipy, Pillow)
# How the metal is found: the iron is greyer than the wood (chroma under 0.8 x lightness in CIE Lab) inside each
# bracket's box, cleaned to one solid shape; the straps and hinges are their painted outlines; rivets are small round
# blobs of the yellower, lighter brass anywhere on the painting.
import io, zipfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd

def srgb2lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]); WP = np.array([0.95047, 1.0, 1.08883])
def f(t): return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
def rgb2lab(rgb):
    fx = f(srgb2lin(rgb) @ M.T / WP)
    return np.stack([116 * fx[..., 1] - 16, 500 * (fx[..., 0] - fx[..., 1]), 200 * (fx[..., 1] - fx[..., 2])], -1)

with zipfile.ZipFile('art/deliveries/wanderers-kit-foot-locker-v1.zip') as z:
    n = next(k for k in z.namelist() if k.endswith('assets/foot_locker_full_blank.png'))
    a = np.asarray(Image.open(io.BytesIO(z.read(n))).convert('RGBA')).astype(float) / 255
lab = rgb2lab(a[..., :3]); L = lab[..., 0]; C = np.hypot(lab[..., 1], lab[..., 2]); hh = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])); al = a[..., 3]
H, W = L.shape
def zone(x0, y0, x1, y1, m):
    z = np.zeros((H, W), bool); z[y0:y1, x0:x1] = True; return z & m
ironish = (C / np.maximum(L, 1) < 0.8) & (L > 6)
brassish = (hh > 66) & (C > 30) & (L > 38)
def clean(m, close=3):
    m = nd.binary_opening(nd.binary_fill_holes(nd.binary_closing(m, iterations=close)), iterations=2)
    lab_, n_ = nd.label(m)
    return lab_ == (np.argmax(nd.sum(m, lab_, range(1, n_ + 1))) + 1) if n_ else m
metal = np.zeros((H, W), bool)
# the six iron corner brackets (lid's two, body's four)
for z in [(10, 15, 150, 150), (1050, 15, 1190, 150), (30, 440, 140, 550), (1060, 440, 1170, 550), (10, 1070, 150, 1260), (1070, 1070, 1199, 1260)]:
    metal |= clean(zone(*z, ironish | brassish))
img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
for x0, y0, x1, y1 in [(199, 409, 288, 473), (911, 409, 999, 473)]: dr.rounded_rectangle((x0, y0, x1, y1), radius=7, fill=255)   # hinges
metal |= np.asarray(img) > 127
# the lid's two straps, less the blanket where it lies over them
img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
for poly in [[(243, 184), (299, 184), (321, 364), (254, 364)], [(888, 184), (947, 184), (927, 396), (865, 396)]]: dr.polygon(poly, fill=255)
blanket = (L > 48) & (C > 18) & (np.arange(H)[:, None] > 318)
metal |= (np.asarray(img) > 127) & ~blanket
# rivets: small round brass blobs (not the blanket's light folds)
lab_, n_ = nd.label(brassish & (L > 55))
sizes = nd.sum(np.ones_like(L), lab_, range(1, n_ + 1))
riv = np.zeros((H, W), bool)
for i, sl in enumerate(nd.find_objects(lab_)):
    hgt, wid = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    if 330 < (sl[0].start + sl[0].stop) / 2 < 400: continue
    if 40 <= sizes[i] <= 900 and 0.6 < hgt / wid < 1.6 and sizes[i] > 0.45 * hgt * wid: riv[sl] |= lab_[sl] == i + 1
metal |= nd.binary_dilation(nd.binary_fill_holes(riv), iterations=2)
paint = (al > 0.02) & ~metal
m = Image.fromarray((paint * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
out = Image.new('RGBA', (W, H), (255, 255, 255, 0)); out.putalpha(m)
out.save('ui/locker/locker-wood-mask.webp', 'WEBP', lossless=True, method=6)
print('wrote ui/locker/locker-wood-mask.webp', W, H)
