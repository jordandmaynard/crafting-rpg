# (v761) Jordan's Amber-Oak storage barrel painting (art/deliveries/Emberwild_Amber-Oak_Storage_Barrel.png, master in
# icons/paint/src/build-barrel-amber-oak.png) as the barrel's build bar icon: trimmed to its alpha, fitted in a 256
# square with the same margin as the saw table's (12 px), halved to 128 in premultiplied RGBa (Lanczos), lossless WebP
# method 6 -> icons/paint/barrel-{128,256}.webp
import sys
from PIL import Image
src = sys.argv[1] if len(sys.argv) > 1 else 'icons/paint/src/build-barrel-amber-oak.png'
im = Image.open(src).convert('RGBA')
im = im.crop(im.getchannel('A').getbbox())
for px in (256, 128):
    room = px - round(12 * px / 256) * 2
    s = room / max(im.size)
    w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    cut = im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
    out = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    out.paste(cut, ((px - w) // 2, (px - h) // 2))
    out.save(f'icons/paint/barrel-{px}.webp', lossless=True, method=6, exact=True)
    print(px, (w, h))
