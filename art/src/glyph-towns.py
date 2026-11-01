# Placeholder glyph for the map's Towns bookmark (v404): three gabled houses in the places glyph's orange and
# brass with a dark brown outline, 84 x 84, drawn 4x and scaled down.
from PIL import Image, ImageDraw
S = 4; W = 84 * S
im = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
OUT, BODY, ROOF, DOOR = (70, 34, 10, 255), (232, 168, 60, 255), (226, 132, 40, 255), (90, 40, 12, 255)
def house(x, base, w, h, roof):
    pts_body = [(x, base), (x, base - h), (x + w, base - h), (x + w, base)]
    pts_roof = [(x - 4 * S, base - h), (x + w / 2, base - h - roof), (x + w + 4 * S, base - h)]
    d.polygon(pts_body, fill=BODY, outline=OUT, width=3 * S)
    d.polygon(pts_roof, fill=ROOF, outline=OUT, width=3 * S)
    dw = w * 0.3
    d.rectangle([x + w / 2 - dw / 2, base - h * 0.55, x + w / 2 + dw / 2, base], fill=DOOR)
house(8 * S, 72 * S, 22 * S, 20 * S, 14 * S)
house(54 * S, 72 * S, 22 * S, 20 * S, 14 * S)
house(28 * S, 74 * S, 28 * S, 30 * S, 20 * S)
im.resize((84, 84), Image.LANCZOS).save('/home/claude/emberwild/ui/map/glyph-towns.webp', lossless=True)
