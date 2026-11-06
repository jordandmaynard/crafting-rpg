# python3 art/src/mana-fill.py ui/belt/xp-fill.webp ui/belt/mana-fill.webp 278  (v929, Jordan: the bar under health is mana, purple)
# the kit's orange bar fill turned purple as the blue XP fill was made (v546): every pixel's hue moved in HLS so the
# median hue lands on the last argument (degrees), lightness and saturation kept, alpha kept; lossless
import sys, colorsys, numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).astype(float) / 255
hls = np.array([[colorsys.rgb_to_hls(*p[:3]) for p in row] for row in im])
on = im[..., 3] > 0.5
shift = float(sys.argv[3]) / 360 - np.median(hls[..., 0][on & (hls[..., 2] > 0.2)])
out = im.copy()
for y in range(im.shape[0]):
    for x in range(im.shape[1]):
        hh, ll, ss = hls[y, x]
        out[y, x, :3] = colorsys.hls_to_rgb((hh + shift) % 1, ll, ss)
Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(sys.argv[2], lossless=True)
