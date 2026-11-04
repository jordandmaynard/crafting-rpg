# (v714, Jordan: the foot locker's tone, hue and contrast should match the crate's, baked into the image)
# Makes ui/locker/locker-window.webp and ui/locker/locker-slot-mask.webp from the kit's source art:
#   python3 art/src/foot-locker-match.py
# The colour pass is a Reinhard transfer in CIE Lab: every opaque pixel of the foot locker painting has its L, a and b
# moved so their means and spreads match the crate's blank master (wanderers-kit-crate-v1/source). The slot mask is a
# rounded rectangle the size of one painted well (161 x 164, corners 12), so the hover and selected tints fill it.
import io, zipfile
import numpy as np
from PIL import Image, ImageDraw

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

def load(zip_path, name):
    with zipfile.ZipFile(zip_path) as z:
        n = next(k for k in z.namelist() if k.endswith(name))
        return np.asarray(Image.open(io.BytesIO(z.read(n))).convert('RGBA')).astype(float) / 255

def stats(a):
    lab = rgb2lab(a[..., :3])[a[..., 3] > 0.9]
    return lab.mean(0), lab.std(0)

crate = load('art/deliveries/wanderers-kit-crate-v1.zip', 'source/crate-window-blank-master.png')
locker = load('art/deliveries/wanderers-kit-foot-locker-v1.zip', 'assets/foot_locker_full_blank.png')
(mc, sc), (ml, sl) = stats(crate), stats(locker)
rgb = lab2rgb((rgb2lab(locker[..., :3]) - ml) * (sc / sl) + mc)
out = np.concatenate([rgb, locker[..., 3:]], -1)
Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save('ui/locker/locker-window.webp', 'WEBP', quality=94, method=6)

S, W, H, R = 4, 161, 164, 12
m = Image.new('L', (W * S, H * S), 0)
ImageDraw.Draw(m).rounded_rectangle((0, 0, W * S - 1, H * S - 1), R * S, fill=255)
mask = Image.new('RGBA', (W, H), (255, 255, 255, 0)); mask.putalpha(m.resize((W, H), Image.LANCZOS))
mask.save('ui/locker/locker-slot-mask.webp', 'WEBP', lossless=True)
