# RPG buildable icons

Ten build-menu icons based on the supplied in-game references.

| File | Buildable |
| --- | --- |
| build-wood-floor-48x48.png | Wood Floor |
| build-stone-floor-48x48.png | Stone Floor |
| build-log-wall-48x48.png | Log Wall |
| build-stucco-wall-48x48.png | Stucco Wall |
| build-stone-wall-48x48.png | Stone Wall |
| build-hearth-48x48.png | Hearth |
| build-saw-table-48x48.png | Saw Table |
| build-grinder-48x48.png | Grinder |
| build-smelter-48x48.png | Smelter |
| build-tanning-rack-48x48.png | Tanning Rack |

## Format and use

Each individual PNG is exactly 48×48, including its single-pixel black contour. Alpha values are only 0 or 255. Black is used only on opaque pixels bordering transparency, including holes. Every icon passes checks for zero interior black pixels, zero solid 2×2 black blocks, and a complete outline.

Use nearest-neighbor / point filtering, whole-pixel placement, integer display scales, and lossless textures. Preserve alpha. Do not color-key black, smooth the art, or add a second outline.

The 240×96 atlas contains five columns and two rows with no extra spacing. The table order above is row-major: the first five items occupy the top row, and the last five the bottom row. The JSON gives top-left-origin frame rectangles.

The labeled preview shows the actual final sprites enlarged 4× using nearest-neighbor. Its labels and gray background are not part of the icon assets.

Built-in image generation produced the artwork, followed by exact-size pixel cleanup. PROMPTS.json contains the generation prompt set. validation.json records the pixel checks.
