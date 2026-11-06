# python3 art/src/buckle-mask.py ui/belt/center-leather.webp ui/belt/buckle-mask.webp 6  (v929, Jordan: XP fills the buckle)
# the belt buckle's window (the brass frame round Lv and the level, on the right of center-leather.webp), as an alpha
# mask: flood the window from its middle over everything that isn't the brass, pull in by the last argument (px of the
# 4x art) off the dark inner rule, soften, then crop to the window and mirror it, as the leather is drawn mirrored
# (.bc-body scaleX(-1)). Prints where the crop sits in the centre piece's 544 x 136 layout.
import sys, numpy as np
from PIL import Image, ImageFilter
from collections import deque
fr = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).astype(int)
h, w = fr.shape[:2]
k = w / 544
r, g, b = fr[..., 0], fr[..., 1], fr[..., 2]
gold = (r > 90) & (r - b > 60)
sy, sx = int(68 * k), int(470.5 * k)                        # the window's middle (4x art: 272, 1882)
inside = np.zeros((h, w), bool)
q = deque([(sy, sx)]); inside[sy, sx] = True
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yy, xx = y + dy, x + dx
        if 0 <= yy < h and 0 <= xx < w and not inside[yy, xx] and not gold[yy, xx]:
            inside[yy, xx] = True; q.append((yy, xx))
ys, xs = np.nonzero(inside)
assert xs.max() - xs.min() < 120 * k and ys.max() - ys.min() < 120 * k, 'flood leaked'
# fill any speck the brass test caught inside (flood the outside of the window's box instead), then close the
# jagged right edge (dilate, erode) before pulling in
bx0, bx1, by0, by1 = xs.min() - 2, xs.max() + 3, ys.min() - 2, ys.max() + 3
sub = inside[by0:by1, bx0:bx1]; out_ = np.zeros_like(sub)
q = deque([(0, 0)]); out_[0, 0] = True
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yy, xx = y + dy, x + dx
        if 0 <= yy < sub.shape[0] and 0 <= xx < sub.shape[1] and not out_[yy, xx] and not sub[yy, xx]:
            out_[yy, xx] = True; q.append((yy, xx))
inside[by0:by1, bx0:bx1] = ~out_
m = Image.fromarray((inside * 255).astype(np.uint8))
m = m.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.MinFilter(11))
m = m.filter(ImageFilter.MinFilter(int(sys.argv[3]) | 1))
m = m.filter(ImageFilter.GaussianBlur(1.2))
# crop to whole layout px (4 art px each), padded by one
x0, x1 = int(xs.min() // k) - 1, int(-(-(xs.max() + 1) // k)) + 1
y0, y1 = int(ys.min() // k) - 1, int(-(-(ys.max() + 1) // k)) + 1
a = np.asarray(m)[int(y0 * k):int(y1 * k), int(x0 * k):int(x1 * k)][:, ::-1]
out = np.zeros(a.shape + (4,), np.uint8); out[..., :3] = 255; out[..., 3] = a
Image.fromarray(out).save(sys.argv[2], lossless=True)
print('layout box: left', 544 - x1, 'top', y0, 'width', x1 - x0, 'height', y1 - y0, 'image', out.shape[1], 'x', out.shape[0])
