# Wanderer’s Kit — crafting asset specification

Production v1. All 25 PNGs are text-free sRGB straight RGBA. Each export is 2× its nominal 1080p logical size. Frames and controls are fixed assets; no runtime nine-slicing. Slice insets and outsets are zero; image repeat is none. Drop shadows are CSS. The content inset is a safe interior, not a slice definition. `layout.json` gives the exact live UI rectangles, including header exceptions.

| File | Export px | Display px | Content inset L,T,R,B (display px) | State |
|---|---|---|---|---|
| `ui/crafting/frame-weapon.png` | 1920×1280 | 960×640 | 110,127,120,69 | normal |
| `ui/crafting/frame-armor.png` | 1920×1280 | 960×640 | 110,127,120,69 | normal |
| `ui/crafting/frame-alchemy.png` | 1920×1280 | 960×640 | 110,127,120,69 | normal |
| `ui/crafting/row-recipe.png` | 660×200 | 330×100 | 14,8,16,8 | normal |
| `ui/crafting/row-recipe-hover.png` | 660×200 | 330×100 | 14,8,16,8 | hover |
| `ui/crafting/row-recipe-pressed.png` | 660×200 | 330×100 | 14,8,16,8 | pressed |
| `ui/crafting/row-recipe-selected.png` | 660×200 | 330×100 | 14,8,16,8 | selected |
| `ui/crafting/row-recipe-selected-hover.png` | 660×200 | 330×100 | 14,8,16,8 | selected-hover |
| `ui/crafting/row-recipe-selected-pressed.png` | 660×200 | 330×100 | 14,8,16,8 | selected-pressed |
| `ui/crafting/row-recipe-focus.png` | 660×200 | 330×100 | 14,8,16,8 | focus |
| `ui/crafting/row-recipe-poor.png` | 660×200 | 330×100 | 14,8,16,8 | poor |
| `ui/crafting/btn-craft.png` | 700×108 | 350×54 | 28,5,28,5 | normal |
| `ui/crafting/btn-craft-hover.png` | 700×108 | 350×54 | 28,5,28,5 | hover |
| `ui/crafting/btn-craft-pressed.png` | 700×108 | 350×54 | 28,5,28,5 | pressed |
| `ui/crafting/btn-craft-disabled.png` | 700×108 | 350×54 | 28,5,28,5 | disabled |
| `ui/crafting/btn-craft-focus.png` | 700×108 | 350×54 | 28,5,28,5 | focus |
| `ui/crafting/btn-craft-busy.png` | 700×108 | 350×54 | 28,5,28,5 | busy |
| `ui/crafting/btn-close.png` | 100×100 | 50×50 | 8,7,8,7 | normal |
| `ui/crafting/btn-close-hover.png` | 100×100 | 50×50 | 8,7,8,7 | hover |
| `ui/crafting/btn-close-pressed.png` | 100×100 | 50×50 | 8,7,8,7 | pressed |
| `ui/crafting/btn-close-focus.png` | 100×100 | 50×50 | 8,7,8,7 | focus |
| `ui/crafting/panel-materials.png` | 660×240 | 330×120 | 10,4,10,5 | normal |
| `ui/crafting/frame-preview.png` | 400×360 | 200×180 | 7,4,7,4 | normal |
| `ui/crafting/divider-h.png` | 700×28 | 350×14 | 0,0,0,0 | normal |
| `ui/crafting/divider-v.png` | 28×884 | 14×442 | 0,0,0,0 | normal |

The three background frames include opaque blank parchment and a blank title plaque/close housing. Their exterior is transparent. The shared component skins have no baked labels, counts or icons. `frame-preview` has a transparent center. All states in a family share canvas dimensions and interaction geometry. Selected recipe art has its own brass rim; keyboard focus adds a separate CSS outline.

Frame art was generated at 1536×1024 and resampled to 1920×1280 delivery exports. Shared pieces were cropped/resampled from the generated component sheet. These are 2× delivery files, not a claim that every original was drawn natively at 2×. The supplied component files preserve the intended proportions at the stated sizes.

Item art under `demo/icons/` is preview fixture content. Weapon/material icons reuse existing painted icons; armor, potion, herb and thread cutouts derive from the approved mockups. Smaller reference cutouts were resampled for the proof. They are not new production item-icon masters. The existing game item/icon registry remains authoritative.

The original mockups under `reference/` show the earlier quantity controls. Those controls are superseded. Follow the assembled production previews and current coding handoff.
