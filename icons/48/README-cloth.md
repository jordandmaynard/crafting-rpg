# Cloth outfit — three RPG inventory icons

This unarmored cloth outfit matches the supplied character reference and uses the same inventory poses, faceted shading, and image rules as the armor set.

| File | Slot | Appearance |
| --- | --- | --- |
| `cloth-shirt-48x48.png` | Torso | Slate-blue long-sleeved tunic, dark green rolled collar, dark brown belt, and small gold buckle. |
| `cloth-pants-48x48.png` | Pants | Plain matte dark-brown cloth trousers, softly folded at the ankles. |
| `cloth-shoes-48x48.png` | Feet | A pair of plain dark-brown soft cloth shoes / low ankle boots. |

All three PNGs are exactly **48×48 pixels**, including the black single-pixel outer contour. Alpha is binary: 0 or 255. Pure black appears only against transparency. Each icon has zero interior black pixels and zero solid 2×2 black blocks.

Import the PNGs with their alpha channel intact. Use nearest-neighbor / point sampling, pixel-aligned positions, and integer display scales such as 48×48, 96×96, or 192×192. Do not color-key black or add another outline.

`cloth-atlas-48px.png` is a transparent 144×48 atlas: shirt, pants, shoes from left to right, with one 48×48 cell per item and no extra padding. `cloth-atlas.json` gives frame rectangles using a top-left origin.

`rpg-cloth-preview.png` shows exact 4× nearest-neighbor enlargements with a grey review background. The grey background and labels are not in the actual sprites.

Artwork used built-in image generation followed by exact-size pixel cleanup and outline validation. Design prompts are retained in `PROMPTS.json`.
