# compose the backpack shell (v378): the kit's recessed body (Wanderer's Kit backpack delta v1.1) moved BODY_DX right,
# under the old inventory-backpack art's left spine (as it was) and its bedroll/header scaled up by S about the
# header's bottom-left strap (80, 372 in the old 2x art), so the header's right stitching lines up with the body's
# right rim. The canvas grows OX left and OY up to hold the bigger header. Usage: compose2.py old.png body@2x.png out.png
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
old = Image.open(sys.argv[1]).convert('RGBA')          # 1012 x 1464 (2x of 506 x 732)
body = Image.open(sys.argv[2]).convert('RGBA')         # 1012 x 1144 (2x of 506 x 572)
HEAD_Y, SPINE_X, F = 372, 128, 5
BODY_DX = 44                                           # 2x px (22 logical)
AX, AY = 80, HEAD_Y
S = (80 + BODY_DX + 993 - AX) / (990 - AX)             # body right rim stitch (x 993 in the body art) / header strap stitch (990, by eye)
OX, OY = 16, 64
W, H = 1092 + BODY_DX + OX, 1464 + OY
def feathered(boxes):
    m = Image.new('L', old.size, 0); d = ImageDraw.Draw(m)
    for b in boxes: d.rectangle(b, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(F))
    k = old.copy(); k.putalpha(ImageChops.multiply(old.getchannel('A'), m)); return k
head = feathered([(0, 0, old.size[0], HEAD_Y)])
spine = feathered([(0, HEAD_Y - 12, SPINE_X, old.size[1]), (0, 1200, 162, 1302)])
hw, hh = round(old.size[0] * S), round(old.size[1] * S)
head = head.resize((hw, hh), Image.LANCZOS)
hx, hy = round(AX + OX - AX * S), round(AY + OY - AY * S)
out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
out.alpha_composite(body, (80 + BODY_DX + OX, 320 + OY))
over = Image.new('RGBA', (W, H), (0, 0, 0, 0))
over.alpha_composite(spine, (OX, OY))
hc = Image.new('RGBA', (W, H), (0, 0, 0, 0)); hc.paste(head, (hx, hy), head)
over.alpha_composite(hc)
sa = Image.new('L', (W, H), 0); sa.paste(over.getchannel('A'), (0, 8)); sa = sa.filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * 0.55))
sh = Image.new('RGBA', (W, H), (12, 6, 3, 0)); sh.putalpha(sa)
out.alpha_composite(sh); out.alpha_composite(over)
out.save(sys.argv[3])
print('S', S, 'size', W, H, 'head at', hx, hy)
