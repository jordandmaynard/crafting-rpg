# Fantasy metal equipment — 28 icons

Four complete equipment sets above iron, ordered **Verdane (green) → Caerite (blue) → Orivane (purple) → Auralith (orange)**. Each tier adds more layered plates, flanges, geometric trim, and sculpted fittings while preserving the pose for each item type.

## Contents

Each material has **Sword, Bow, Spear, Boots, Pants, Torso, Helmet**. File names follow `<type>-<metal>-48x48.png`, for example `sword-verdane-48x48.png` and `helmet-auralith-48x48.png`. Boots show a pair; pants contain leg armor without boots; torso and helmet contain no wearer.

| Tier above iron | Metal | Color | Ornamentation |
| --- | --- | --- | --- |
| 1 | Verdane | Green | Restrained leaf bevels and raised rims |
| 2 | Caerite | Blue | Stepped collars, layered plates and chevrons |
| 3 | Orivane | Purple | Fluting, sculpted flanges and geometric inlays |
| 4 | Auralith | Orange | Regal fan plates, swept flanges and crownlike forms |

## Pixel format and use

Individual PNGs are exactly **48×48 pixels**, including the single-pixel black contour. Alpha values are only **0 or 255**. Pure black appears only on opaque pixels bordering transparency, including gaps. All icons pass checks for zero interior black pixels, zero solid 2×2 black blocks, and a complete contour. Shading inside the image uses material colors.

Import with nearest-neighbor / point filtering, preserve alpha, disable lossy texture compression and smoothing, and align to whole pixels. Display at 48×48 or integer multiples. Do not color-key black or add a second outline.

## Atlases

`equipment-atlas-48px.png` is **192×336**, a 4-column × 7-row sheet of 48×48 cells with no extra spacing.

Columns from left: **Verdane, Caerite, Orivane, Auralith**. Rows from top: **Sword, Bow, Spear, Boots, Pants, Torso, Helmet**.

`equipment-atlas.json` lists exact frame rectangles with top-left origin. `weapons-atlas-48px.png` is 192×144 with the first three rows. `armor-atlas-48px.png` is 192×192 with the last four rows; subtract 144 from the full-sheet y coordinate when using that armor sheet.

`weapons-preview.png` and `armor-preview.png` show the exact final pixels at 4× nearest-neighbor scale. Their labels and gray background are not part of the assets.

`validation.json` records pixel checks. `PROMPTS.json` retains the generation prompt set. Artwork was made with built-in image generation, then normalized to exact size and cleaned for the contour and alpha rules.
