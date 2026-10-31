# Painterly resource item icons — 256×256

Four standalone inventory icons: rough stone, a three-log stack, sawn wood plank stack and three cut stone blocks. Each is a 256×256 RGBA PNG on transparent background, with exact binary alpha values 0 and 255 only. Shapes are centered with a transparent margin, rendered as hand-painted material items rather than minimal silhouettes or 48px pixel art. There is no 1:2 isometric restriction for item icons.

| Filename | Item |
| --- | --- |
| rough-stone-painterly-256x256.png | Rough stone |
| wood-logs-painterly-256x256.png | Wood logs |
| wood-planks-painterly-256x256.png | Sawn planks |
| stone-blocks-painterly-256x256.png | Refined stone block stack |

Use square aspect ratio and linear or mipmapped filtering at arbitrary display sizes. Binary-alpha edges may look a little harder than soft transparency at large zoom; this is intentional for the requested 1-bit alpha exports. Add item counts and hover frames in game UI. resource-icons-preview.png places the icons against a dark UI color at native size and at 64/48px; it is a review sheet, not a sprite atlas.

Image generation masters were cropped to object bounds, resampled with Lanczos into a 224px maximum item area, and thresholded to exact binary alpha after resizing. PROMPTS.json records image prompts and sources. validation.json records dimensions and binary alpha checks.
