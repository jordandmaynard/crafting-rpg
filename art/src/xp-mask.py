# python3 art/src/xp-mask.py ui/belt/xp-frame.webp ui/belt/xp-mask.webp 5  (v691)
# the XP frame's glass, as an alpha mask the same size as xp-frame.webp: flood the glass from the middle over
# everything that isn't the gold rim, then pull in off the dark inner rule so the fill sits inside it
import sys, numpy as np
from PIL import Image, ImageFilter
from collections import deque
fr = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).astype(int)
h, w = fr.shape[:2]
r, g, b = fr[..., 0], fr[..., 1], fr[..., 2]
gold = (r > 90) & (r - b > 60)
inside = np.zeros((h, w), bool)
q = deque([(h // 2, w // 2)]); inside[h // 2, w // 2] = True
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yy, xx = y + dy, x + dx
        if 0 <= yy < h and 0 <= xx < w and not inside[yy, xx] and not gold[yy, xx]:
            inside[yy, xx] = True; q.append((yy, xx))
assert not inside[0].any() and not inside[-1].any(), 'flood leaked'
m = Image.fromarray((inside * 255).astype(np.uint8))
m = m.filter(ImageFilter.MinFilter(int(sys.argv[3])))      # off the black inner rule
m = m.filter(ImageFilter.GaussianBlur(0.6))                # soft edge
a = np.asarray(m)
out = np.zeros((h, w, 4), np.uint8); out[..., :3] = 255; out[..., 3] = a
Image.fromarray(out).save(sys.argv[2], lossless=True)
ys, xs = np.nonzero(a > 127); print('mask bbox', xs.min(), xs.max(), ys.min(), ys.max())
