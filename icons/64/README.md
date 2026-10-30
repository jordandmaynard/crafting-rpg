# RPG buildables and general actions — 64px isometric edition

Fourteen redrawn icons: ten buildables and four general action symbols. This is a separate 64px asset set; the earlier 48px files are preserved.

## Icon list

| File | Icon |
| --- | --- |
| build-wood-floor-64x64.png | Wood Floor |
| build-stone-floor-64x64.png | Stone Floor |
| build-log-wall-64x64.png | Log Wall |
| build-stucco-wall-64x64.png | Stucco Wall |
| build-stone-wall-64x64.png | Stone Wall |
| build-hearth-64x64.png | Hearth |
| build-saw-table-64x64.png | Saw Table |
| build-grinder-64x64.png | Grinder |
| build-smelter-64x64.png | Smelter |
| build-tanning-rack-64x64.png | Tanning Rack |
| action-dash-64x64.png | Dash |
| action-inventory-64x64.png | Inventory |
| action-build-64x64.png | Build |
| action-map-64x64.png | Map |

## Pixel and projection rules

Every individual PNG is exactly **64×64**, including a single-pixel black contour. Alpha is binary, only 0 or 255. Pure black is confined to the boundary between opaque pixels and transparency, including openings. All 14 pass checks for zero interior black pixels, zero solid 2×2 black blocks, and a complete contour.

Forms use classic **2:1 pixel isometric**: the horizontal world axes rise or fall one pixel for every two pixels across, with upright vertical edges. Both receding axes use the same projection. Floors and map received explicit corner alignment; other forms were redrawn using the same geometric projection reference. Curves, pointed tops, flames, and irregular leather edges naturally have their own contour directions.

Artwork was freshly generated for the 64px design, then corrected for the isometric view and raster-cleaned at 64px. It does not enlarge the old 48px icon PNGs. Built-in image generation was used; PROMPTS.json preserves the prompt set.

## Import settings

Use point / nearest-neighbor filtering, integer display scales (64, 128, 192 pixels), whole-pixel placement, lossless texture import, and alpha blending. Disable smoothing and avoid lossy compression. Do not color-key black or add another outline. Button labels, shortcuts and frames belong in the UI, separately from the symbols.

## Atlases

The combined atlas is **320×192**, with 5 columns and 3 rows of 64×64 cells. Read the icon list above from left to right, then top to bottom. The final cell is empty. JSON frame coordinates use a top-left origin.

The buildables-only atlas is **320×128**, first ten icons. The actions-only atlas is **256×64**, ordered Dash, Inventory, Build, Map. The two labeled previews show the exact final PNG pixels enlarged 3× using nearest-neighbor; their labels and gray background are not part of the icon assets.

validation.json records size, alpha and contour checks.
