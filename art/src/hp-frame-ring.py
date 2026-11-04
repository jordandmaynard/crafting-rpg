# (v704) ui/belt/hp-frame-ring.webp: the health frame (ui/belt/hp-frame.webp) with its glass cut out, drawn over the
# red fill so the frame's brass rim and its inner dark rule sit on top of the bar's ends (Jordan). The glass is the
# frame's own outline shrunk by the rim's thickness (9 px at the art's 2x: brass then the dark rule), so it follows the
# rounded ends; its edge softened by a slight blur.
from PIL import Image, ImageFilter, ImageChops
import sys
src = sys.argv[1] if len(sys.argv) > 1 else 'ui/belt/hp-frame.webp'
out = sys.argv[2] if len(sys.argv) > 2 else 'ui/belt/hp-frame-ring.webp'
RIM = 9
im = Image.open(src).convert('RGBA')
a = im.getchannel('A')
# (padded with clear pixels first: the frame runs to the image's edges, and the filter would treat beyond them as solid)
w, h = im.size
solid = Image.new('L', (w + 4 * RIM, h + 4 * RIM), 0)
solid.paste(a.point(lambda v: 255 if v > 128 else 0), (2 * RIM, 2 * RIM))
hole = solid.filter(ImageFilter.MinFilter(2 * RIM + 1)).filter(ImageFilter.GaussianBlur(0.6)).crop((2 * RIM, 2 * RIM, 2 * RIM + w, 2 * RIM + h))
im.putalpha(ImageChops.multiply(a, ImageChops.invert(hole)))
im.save(out, 'WEBP', lossless=True, method=6, exact=True)
print('hole bbox', hole.point(lambda v: 255 if v > 128 else 0).getbbox(), 'of', im.size)
