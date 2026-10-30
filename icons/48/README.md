# RPG icon pack — 41 final icons

This archive collects every final 48×48 item icon created in this thread: **13 resource icons, 12 weapon icons, and 16 armor icons**. It uses the latest corrected versions, including the warm rock matrix on the blue-silver iron ore and corrected outlines. Superseded drafts and large generation previews are omitted. Both the single stone block and the three-block alternative are included.

## Files and image rules

- `resources/`: 13 individual resource PNGs.
- `weapons/`: 12 individual weapon PNGs.
- `armor/`: 16 individual armor PNGs.
- `resources-atlas-48px.png`, `weapons-atlas-48px.png`, `armor-atlas-48px.png`: optional transparent sprite atlases.
- The matching `*-atlas.json` files describe every frame using pixel coordinates.
- `armor-preview.png`: labeled 4× nearest-neighbor enlargement of the final armor sprites, for review only.
- `validation.json`: per-icon format and outline checks.

Every individual icon is exactly **48×48 pixels**, including its black outer contour. PNG alpha is binary: **0** means fully transparent and **255** means fully opaque. There are no partially transparent edge pixels. Pure black is reserved for the single-pixel contour where the item meets transparency, including open gaps between parts. Interior details use material colors rather than black. All 41 icons were checked for interior black pixels and solid 2×2 black blocks; both counts are zero.

The style uses muted colors, broad faceted shading, and highlights from the upper left. Preview backgrounds, labels, and enlarged pixels are not baked into the individual icons.

## Resource icons

| Icon | File | What it depicts |
| --- | --- | --- |
| Raw wood logs | [wood-logs-48x48.png](./resources/wood-logs-48x48.png) | A compact stack of three bark-covered logs. |
| Worked wood planks | [wood-planks-48x48.png](./resources/wood-planks-48x48.png) | A stack of sawn wooden planks refined from the logs. |
| Rough stone | [rough-stone-48x48.png](./resources/rough-stone-48x48.png) | One irregular natural stone with broad grey facets. |
| Single refined stone block | [stone-block-48x48.png](./resources/stone-block-48x48.png) | One dressed rectangular stone block; an alternative to the three-block stack. |
| Three refined stone blocks | [stone-blocks-48x48.png](./resources/stone-blocks-48x48.png) | Two blocks below and one above; distinguishes worked stone from the single iron ingot. |
| Copper ore | [copper-ore-48x48.png](./resources/copper-ore-48x48.png) | Grey rock containing orange copper deposits and subdued teal mineral flecks. |
| Iron ore | [iron-ore-48x48.png](./resources/iron-ore-48x48.png) | Latest revision: cool blue-silver iron deposits in subtly brown-grey rock, without rusty-orange oxidation. |
| Copper ingot | [copper-ingot-48x48.png](./resources/copper-ingot-48x48.png) | One refined orange-copper bar. |
| Iron ingot | [iron-ingot-48x48.png](./resources/iron-ingot-48x48.png) | One refined cool silver-blue bar. |
| Raw pelt / hide | [raw-hide-48x48.png](./resources/raw-hide-48x48.png) | One spread, irregular brown animal hide with the fur side up. |
| Worked leather | [leather-stack-48x48.png](./resources/leather-stack-48x48.png) | Three folded sheets of brown leather. |
| Bones | [bones-stack-48x48.png](./resources/bones-stack-48x48.png) | A compact stack of three clean ivory long bones. |
| Wheat | [wheat-bundle-48x48.png](./resources/wheat-bundle-48x48.png) | One bound golden wheat sheaf. |

## Weapon icons

Each weapon type keeps a similar position and angle across its four material tiers, pointing from lower left to upper right. Decoration increases from wood to bone to copper to iron. Bone and metal spears retain wooden shafts; the tier identifies their heads and fittings.

| Type | Wood — tier 1 | Bone — tier 2 | Copper — tier 3 | Iron — tier 4 |
| --- | --- | --- | --- | --- |
| Sword | [wood](./weapons/sword-wood-48x48.png) | [bone](./weapons/sword-bone-48x48.png) | [copper](./weapons/sword-copper-48x48.png) | [iron](./weapons/sword-iron-48x48.png) |
| Bow | [wood](./weapons/bow-wood-48x48.png) | [bone](./weapons/bow-bone-48x48.png) | [copper](./weapons/bow-copper-48x48.png) | [iron](./weapons/bow-iron-48x48.png) |
| Spear | [wood](./weapons/spear-wood-48x48.png) | [bone](./weapons/spear-bone-48x48.png) | [copper](./weapons/spear-copper-48x48.png) | [iron](./weapons/spear-iron-48x48.png) |

## Armor icons

The lowest armor tier is **leather**, followed by bone, **copper chainmail**, and iron plate. The pose and approximate scale remain consistent within each equipment slot. Boots are shown as a pair; pants run from waist to ankle without boots; torso and helmet icons show empty equipment without a wearer.

| Slot | Leather — tier 1 | Bone — tier 2 | Copper chainmail — tier 3 | Iron — tier 4 |
| --- | --- | --- | --- | --- |
| Boots | [leather](./armor/boots-leather-48x48.png) | [bone](./armor/boots-bone-48x48.png) | [copper chainmail](./armor/boots-copper-48x48.png) | [iron](./armor/boots-iron-48x48.png) |
| Pants | [leather](./armor/pants-leather-48x48.png) | [bone](./armor/pants-bone-48x48.png) | [copper chainmail](./armor/pants-copper-48x48.png) | [iron](./armor/pants-iron-48x48.png) |
| Torso | [leather](./armor/torso-leather-48x48.png) | [bone](./armor/torso-bone-48x48.png) | [copper chainmail](./armor/torso-copper-48x48.png) | [iron](./armor/torso-iron-48x48.png) |
| Helmet | [leather](./armor/helmet-leather-48x48.png) | [bone](./armor/helmet-bone-48x48.png) | [copper chainmail](./armor/helmet-copper-48x48.png) | [iron](./armor/helmet-iron-48x48.png) |

Leather uses brown hide panels; bone uses ivory plates over leather; copper uses a woven mail pattern for all four slots, including a coif for the helmet; iron uses articulated silver-blue plate armor.

## How to use the individual PNGs

1. Extract the ZIP while preserving the folder layout. The links in this guide then open the matching image files.
2. Import a PNG as a 2D sprite or UI image and preserve its alpha channel. Use its full 48×48 canvas; the outline and transparent margin are already included.
3. Choose **nearest-neighbor / point filtering**. Turn off smoothing and lossy texture compression. For a fixed-resolution pixel-art UI, disable mipmaps when your engine provides that option.
4. Display icons at 48×48 or integer multiples such as 96×96, 144×144, or 192×192. Keep positions aligned to the pixel grid to avoid blurred edges.
5. Composite using the PNG alpha. Do not color-key black: black is part of the outline. Do not add another stroke or background to the source asset unless your UI deliberately calls for it.
6. Use filenames without `-48x48.png` as stable item IDs, for example `iron-ore`, `sword-bone`, or `torso-copper`. Map those IDs to your own item definitions, recipes, stats, or equipment slots.

## How to use the atlases

| Atlas | Dimensions | Grid | Order |
| --- | --- | --- | --- |
| Resources | 192×192 | 4 columns × 4 rows | Same order as the resource table; the final 3 cells are empty. |
| Weapons | 192×144 | 4 columns × 3 rows | Columns: wood, bone, copper, iron. Rows: sword, bow, spear. |
| Armor | 192×192 | 4 columns × 4 rows | Columns: leather, bone, copper, iron. Rows: boots, pants, torso, helmet. |

Every atlas cell is exactly **48×48**. There is no extra spacing between cells; each icon retains the transparent margin inside its cell. Slice using a 48×48 grid, or read the `frames` array in the corresponding JSON file.

Coordinates use a top-left origin: `x` increases to the right and `y` increases downward. Each frame gives `id`, `file`, `x`, `y`, `width`, and `height`. For a cell at zero-based column `c` and row `r`, its pixel rectangle starts at `(48*c, 48*r)` and has size 48×48. Convert the Y coordinate if your renderer uses a bottom-left origin.

Individual PNGs and atlas frames contain the same pixels. Choose whichever workflow your engine supports; you do not need to use both.

## Revision notes

- Logs and planks use the corrected outer-only black contours.
- Copper ore keeps its original copper deposits.
- Iron ore uses the latest subtly brown-grey rock with non-oxidized blue-silver iron, matching the iron ingot.
- Both refined stone presentations are included: one block and three stacked blocks.
- Weapon bowstrings use continuous pixel-grid lines.
- All copper armor slots are chainmail rather than copper plate.

Artwork was generated with built-in image generation and finalized with exact-size pixel cleanup. The PNGs in the three item folders are the game-ready 48×48 deliverables.
