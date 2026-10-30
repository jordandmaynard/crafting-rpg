# Metal rarity progression — revised icon pack

**Iron → Verdane → Caerite → Orivane → Auralith** follows the **white → green → blue → purple → orange** rarity progression. This pack contains ten 48×48 icons: one ore and one ingot for each of the five active metals.

| Order | Metal | Rarity color | Ore | Ingot |
| --- | --- | --- | --- | --- |
| 1 | Iron | White / silver | [iron-ore-48x48.png](./iron-ore-48x48.png) | [iron-ingot-48x48.png](./iron-ingot-48x48.png) |
| 2 | Verdane | Green | [verdane-ore-48x48.png](./verdane-ore-48x48.png) | [verdane-ingot-48x48.png](./verdane-ingot-48x48.png) |
| 3 | Caerite | Blue | [caerite-ore-48x48.png](./caerite-ore-48x48.png) | [caerite-ingot-48x48.png](./caerite-ingot-48x48.png) |
| 4 | Orivane | Purple | [orivane-ore-48x48.png](./orivane-ore-48x48.png) | [orivane-ingot-48x48.png](./orivane-ingot-48x48.png) |
| 5 | Auralith | Orange | [auralith-ore-48x48.png](./auralith-ore-48x48.png) | [auralith-ingot-48x48.png](./auralith-ingot-48x48.png) |

## Changes from the previous pack

- Keldrite is retired and is not included in this active pack.
- Cindral has been replaced by **Caerite**, a saturated sapphire/azure-blue metal. Change item IDs from `cindral-ore` / `cindral-ingot` to `caerite-ore` / `caerite-ingot`.
- **Auralith keeps its name and IDs**, with orange metal replacing the old ivory-gold palette.
- Iron is included as the white/silver baseline. Its existing artwork is unchanged.
- Verdane and Orivane retain their existing artwork and IDs.
- Rock host material remains neutral so exposed ore deposits match their ingot colors.

## Format and use

All individual PNGs are exactly **48×48 pixels**, including the **single-pixel black outer contour**. Alpha is binary: **0 or 255**. Black is only used where the silhouette touches transparency. All ten icons pass the checks for zero interior black pixels and zero solid 2×2 black blocks.

Use nearest-neighbor / point filtering, pixel-aligned placement, and integer display scales such as 48×48, 96×96, or 144×144. Preserve alpha, avoid smoothing and lossy compression, and do not color-key black or add another outline.

## Atlas

`advanced-metals-atlas-48px.png` is **240×96**, with five columns and two rows of 48×48 cells. Columns: **Iron, Verdane, Caerite, Orivane, Auralith**. Top row: ore. Bottom row: ingots. There is no extra spacing between cells.

`advanced-metals-atlas.json` gives frame rectangles using a top-left pixel origin. The first atlas column now contains Iron instead of Keldrite, and the third contains Caerite instead of Cindral. Update any hard-coded frame references accordingly.

`fantasy-metals-preview.png` shows the exact final sprites at 3× nearest-neighbor scale. Its labels and grey background are not part of the sprite PNGs.

`validation.json` records the pixel checks. `PROMPTS.json` retains this revision’s color-edit prompts. Artwork uses built-in image generation followed by exact-size pixel cleanup.
