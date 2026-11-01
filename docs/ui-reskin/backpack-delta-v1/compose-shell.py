# compose the backpack shell: new recessed body (Wanderer's Kit backpack delta v1.1) under the retained
# bedroll/header and left spine of the old inventory-backpack art
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
old = Image.open(sys.argv[1]).convert('RGBA')          # 1012 x 1464 (2x of 506 x 732)
body = Image.open(sys.argv[2]).convert('RGBA')         # 1012 x 1144 (2x of 506 x 572)
HEAD_Y, SPINE_X, F = int(sys.argv[4]), int(sys.argv[5]), 5
W, H = 1092, 1464
m = Image.new('L', old.size, 0); d = ImageDraw.Draw(m)
d.rectangle((0, 0, old.size[0], HEAD_Y), fill=255)
d.rectangle((0, 0, SPINE_X, old.size[1]), fill=255)
d.rectangle((0, 1200, 162, 1302), fill=255)   # the small brass plate low on the spine sits over the old frame
m = m.filter(ImageFilter.GaussianBlur(F))
a = ImageChops.multiply(old.getchannel('A'), m)
keep = old.copy(); keep.putalpha(a)
out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
out.alpha_composite(body, (80, 320))
sh = Image.new('RGBA', (W, H), (12, 6, 3, 0))
sa = Image.new('L', (W, H), 0); sa.paste(a, (0, 8)); sa = sa.filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * 0.55))
sh.putalpha(sa)
out.alpha_composite(sh)
out.alpha_composite(keep, (0, 0))
out.save(sys.argv[3])
