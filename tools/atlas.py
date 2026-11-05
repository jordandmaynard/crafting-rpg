#!/usr/bin/env python3
"""Emberwild's painted icon sheets (atlases).

The artifact holds at most 511 files, so the painted icons ship packed into sheets, one a set
(icons/atlas/<sheet>-256.webp and -128.webp), not as a file an icon.

  icons/paint/<key>-256.webp, <key>-128.webp   one icon's cell, exactly as it is shown (kept in the repo, not published)
  icons/atlas/atlas.json                       which icon goes in which sheet, in order, and the sheet's columns
  icons/atlas/<sheet>-{256,128}.webp           the sheets the game loads (published)
  index.html, between // <atlas> and // </atlas>   PAINT_ATLAS, written by this script

Commands (run from anywhere; needs Pillow):

  python3 tools/atlas.py
      Builds every sheet from its cells. A sheet is only rewritten when its pixels changed, and each sheet carries
      its own rev (a hash of its pixels) in the game's URLs, so a browser fetches a sheet again only when it changed.
      Prints the sheet files to publish.

  python3 tools/atlas.py add <key> <master.png> [--fit]
      Makes an icon's cells from a painting: 256 px (premultiplied Lanczos) and 128 px (the 256 halved).
      --fit scales the painting's opaque part to 232 px, centred (the 12 px margin the resource icons use).
      Then put <key> in a sheet in atlas.json (if it's new) and run the script again.

Replacing one icon: add <key> <new painting>, then run the script; publish the two files of that sheet and index.html.

A sheet's pad is a gutter round each cell (in 256 px; half that in the 128 sheet) filled with the cell's own edge
pixels, so when the browser shrinks a sheet a cell never picks up its neighbour's colour at its edges. The opaque
ability icons need it; the first sheets (v655-v864, transparent edges) were packed without one.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CELLS = ROOT / 'icons' / 'paint'
ATLAS = ROOT / 'icons' / 'atlas'
MANIFEST = ATLAS / 'atlas.json'
INDEX = ROOT / 'index.html'
BEGIN, END = '// <atlas>', '// </atlas>'
SIZES = (256, 128)


def save(im, path):
    im.save(path, 'WEBP', lossless=True, quality=100, method=6, exact=True)


def same_pixels(im, path):
    if not path.exists():
        return False
    old = Image.open(path)
    old.load()
    return old.convert('RGBA').size == im.size and old.convert('RGBA').tobytes() == im.tobytes()


def shrink(im, n):
    """Premultiplied Lanczos, so clear pixels don't darken the edges."""
    return im.convert('RGBa').resize((n, n), Image.LANCZOS).convert('RGBA')


def cell(key, px):
    p = CELLS / f'{key}-{px}.webp'
    if p.exists():
        im = Image.open(p).convert('RGBA')
    elif px == 128 and (CELLS / f'{key}-256.webp').exists():
        im = shrink(Image.open(CELLS / f'{key}-256.webp').convert('RGBA'), 128)
    else:
        sys.exit(f'no cell for {key}: make it with  python3 tools/atlas.py add {key} <painting.png>')
    if im.size != (px, px):
        sys.exit(f'{p.name} is {im.size[0]}x{im.size[1]}, not {px}x{px}')
    return im


def pack(sheet, px):
    cols, keys, pad = sheet['cols'], sheet['cells'], sheet.get('pad', 0) * px // 256
    rows = -(-len(keys) // cols)
    stride = px + 2 * pad
    out = Image.new('RGBA', (cols * stride, rows * stride), (0, 0, 0, 0))
    for i, k in enumerate(keys):
        im = cell(k, px)
        x, y = (i % cols) * stride + pad, (i // cols) * stride + pad
        if pad:
            # the gutter: the cell's edge pixels pulled out (sides, then corners)
            big = im.resize((px + 2 * pad, px + 2 * pad), Image.NEAREST)
            big.paste(im.crop((0, 0, px, 1)).resize((px, pad)), (pad, 0))
            big.paste(im.crop((0, px - 1, px, px)).resize((px, pad)), (pad, px + pad))
            big.paste(im.crop((0, 0, 1, px)).resize((pad, px)), (0, pad))
            big.paste(im.crop((px - 1, 0, px, px)).resize((pad, px)), (px + pad, pad))
            for cx, cy, sx, sy in ((0, 0, 0, 0), (px + pad, 0, px - 1, 0), (0, px + pad, 0, px - 1), (px + pad, px + pad, px - 1, px - 1)):
                big.paste(im.getpixel((sx, sy)), (cx, cy, cx + pad, cy + pad))
            big.paste(im, (pad, pad))
            out.paste(big, (x - pad, y - pad))
        else:
            out.paste(im, (x, y))
    return out, rows


def build():
    sheets = json.loads(MANIFEST.read_text())['sheets']
    seen = {}
    for n, s in sheets.items():
        for k in s['cells']:
            if k in seen:
                sys.exit(f'{k} is in both {seen[k]} and {n}')
            seen[k] = n
        if s.get('pad', 0) % 2:
            sys.exit(f'{n}: pad must be even (it halves for the 128 sheet)')
    changed, lines = [], []
    for n, s in sheets.items():
        h = hashlib.sha256()
        for px in SIZES:
            im, rows = pack(s, px)
            h.update(im.tobytes())
            path = ATLAS / f'{n}-{px}.webp'
            if not same_pixels(im, path):
                save(im, path)
                changed.append(path.relative_to(ROOT).as_posix())
        rev = h.hexdigest()[:8]
        if s.get('note'):
            lines.append(f"  // {s['note']}")
        keys = ', '.join(f"'{k}'" for k in s['cells'])
        items = ', items: true' if s.get('items') else ''
        lines.append(f"  '{n}': {{ cols: {s['cols']}, rows: {rows}, pad: {s.get('pad', 0)}, rev: '{rev}'{items}, keys: [{keys}] }},")
    block = (f"{BEGIN} (written by tools/atlas.py from icons/atlas/atlas.json: edit those, not this)\n"
             "const PAINT_ATLAS = {\n" + '\n'.join(lines) + "\n};\n" + END)
    src = INDEX.read_text()
    new, n = re.subn(re.escape(BEGIN) + r'.*?' + re.escape(END), lambda m: block, src, flags=re.S)
    if n != 1:
        sys.exit(f'index.html needs one {BEGIN} ... {END} block (found {n})')
    if new != src:
        INDEX.write_text(new)
        changed.append('index.html')
    stale = sorted(p.name for p in ATLAS.glob('*.webp') if re.sub(r'-(128|256)\.webp$', '', p.name) not in sheets)
    print(f'{len(sheets)} sheets, {len(seen)} icons, {2 * len(sheets)} sheet files')
    print('changed (publish these):' if changed else 'nothing changed')
    for c in changed:
        print('  ' + c)
    if stale:
        print('sheets no longer in atlas.json (delete them, and remove them from the artifact):')
        for s in stale:
            print('  icons/atlas/' + s)


def add(key, master, fit):
    im = Image.open(master).convert('RGBA')
    if fit:
        bbox = im.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
        im = im.crop(bbox)
        k = 232 / max(im.size)
        w, h = max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))
        im = im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
        c = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
        c.paste(im, ((256 - w) // 2, (256 - h) // 2))
        im = c
    elif im.size != (256, 256):
        if im.size[0] != im.size[1]:
            sys.exit(f'{master} is not square: use --fit, or square it first')
        im = shrink(im, 256)
    save(im, CELLS / f'{key}-256.webp')
    save(shrink(im, 128), CELLS / f'{key}-128.webp')
    sheets = json.loads(MANIFEST.read_text())['sheets']
    home = next((n for n, s in sheets.items() if key in s['cells']), None)
    print(f'made icons/paint/{key}-256.webp and -128.webp; ' +
          (f'it is in sheet {home}: run  python3 tools/atlas.py' if home else 'put it in a sheet in icons/atlas/atlas.json, then run  python3 tools/atlas.py'))


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        build()
    elif a[0] == 'add' and len(a) >= 3:
        add(a[1], a[2], '--fit' in a[3:])
    else:
        sys.exit(__doc__)
