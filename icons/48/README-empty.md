# Empty equipment slot markers

Six subdued grey-purple placeholders for the empty slots on the left-hand paper doll. These are UI slot markers, not equipable items.

| Slot | PNG | Symbol | Paper-doll position |
| --- | --- | --- | --- |
| Head | `empty-head-48x48.png` | Open-faced helmet | Top center |
| Weapon | `empty-weapon-48x48.png` | Diagonal sword | Left of chest |
| Chest | `empty-chest-48x48.png` | Torso armor / vest | Center |
| Amulet | `empty-amulet-48x48.png` | Necklace with a diamond pendant | Right of chest |
| Legs | `empty-legs-48x48.png` | Trousers | Below chest |
| Boots | `empty-boots-48x48.png` | Single boot, toe to the right | Below legs |

## Image rules

- Every marker is exactly **48×48 pixels** with a centered silhouette of up to 40 pixels, including its outline.
- Alpha is binary: **0 or 255**, with no antialiased edge pixels.
- A **one-pixel pure-black contour** touches transparency. No interior black pixels or solid 2×2 black blocks remain.
- The shared three-color purple palette is body `#51445F`, highlight `#66566F`, and shadow `#3B3248`.
- No slot borders, labels, background tiles or numbers are baked into the sprites.

## Use in the paper doll

1. Assign each PNG to its matching empty equipment slot.
2. Center the full 48×48 canvas in the existing slot rectangle and retain the slot label in the UI.
3. Show this marker only while the slot is empty. Replace or hide it when an equipped item icon is drawn.
4. Use nearest-neighbor / point filtering. Display at integer scales, such as 48×48 or 96×96, with pixel-aligned placement.
5. Preserve alpha and the existing muted colors. Do not color-key black or add a second outline.

## Optional atlas

`empty-slots-atlas-48px.png` is **144×96**, containing three columns and two rows of 48×48 cells, with no extra spacing. Row 1: Head, Weapon, Chest. Row 2: Amulet, Legs, Boots.

`empty-slots-atlas.json` supplies frame rectangles using top-left pixel coordinates and zero-based paper-doll row/column positions.

`paper-doll-empty-slots-preview.png` is a layout preview with the sprites enlarged exactly 2×. Its labels and tile backgrounds are for preview only.

Created with built-in image generation, followed by palette normalization, exact-size pixel cleanup, and alpha/outline validation. Design prompts are included in `PROMPTS.json`.
