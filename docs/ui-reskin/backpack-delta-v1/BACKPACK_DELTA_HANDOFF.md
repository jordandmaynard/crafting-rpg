# Wanderer’s Kit — backpack delta v1.1

**Parallel-wall correction:** Replace `assets/backpack-body-normal.png` and `assets/backpack-body-normal@2x.png` from the earlier v1 pack. All other runtime PNGs and all placement coordinates are unchanged. The updated pack includes the unchanged pieces for a complete handoff; an existing integration needs only the two body PNG replacements. The proof, layout revision metadata, prompts and asset hashes have been refreshed.

The floor must remain a rectangular, constant-width surface from the first row through the last. Both inner side-wall boundaries run vertically rather than converging toward the top. Convey depth with the rolled rim, inward-facing wall shading and contact shadows. Do not add a perspective transform, skew the slot grid, taper the body during layout, or let decorative walls cover the top corner slots.

Replace only the backpack body, backpack cell skin, and the three inventory utility controls. This pack implements the approved recessed bag interior, an unobstructed 4 × 5 grid, and three compact horizontal buttons. The destroy control uses the same button as the other two, with a red face tint. It is not a sewn patch.

This is an asset and integration handoff; the game repository was not available, so these changes have not been applied or tested in the game.

## Keep and reuse

Keep the character folio, character/equipment layout, bedroll, title/count/close controls, left spine and buckles, HUD, item artwork, and existing gameplay handlers. Do not regenerate them. Existing non-backpack slot skins remain unchanged. Do not use the assembled proof as a runtime background.

The earlier handoff describes `inventory-backpack.png` as a single fixed-proportion image. Replace its lower flat body rather than layering the entire old image on top of this patch. Retain the existing bedroll/header/spine art by clipping or masking the original source; remove the old body and its baked cells. The original PNG was not included here, so inspect its actual pixels to trace those retained contours. Do not assume a rectangular crop preserves every buckle. Overlap retained trim over the new blank top/left wall only; it must never cover the live grid or utility row. Keep the existing title, capacity count and close hit area aligned to their reused header.

## Files

All coordinates below are logical pixels. `assets/*@2x.png` contains twice the pixels in each dimension; display at half intrinsic dimensions. The unqualified PNGs are 1× fallbacks. Use one resolution per piece, not both at once. All are RGBA with smooth alpha, transparent exterior, and opaque painted interiors. Do not apply the binary-alpha rule used by some item icons to this UI artwork.

| Normal piece | Logical size | Use |
|---|---:|---|
| `backpack-body-normal.png` | 506 × 572 | Blank recessed suede floor, rolled walls/lip, blank leather front |
| `cell-backpack-normal.png` | 90 × 74 | Reusable empty cell, once per existing inventory slot |
| `button-utility-normal.png` | 120 × 50 | Shared frame and face for all three controls |
| `icon-refine-all.png` | 40 × 40 | Hopper, ore, refined bars and curved arrow |
| `icon-store-all.png` | 40 × 40 | Open crate and downward arrow |
| `icon-destroy-drop.png` | 40 × 40 | Waste pail with X |
| `mask-backpack-slot.png` | 90 × 74 | White alpha coverage for slot-well tint |
| `mask-utility-face.png` | 120 × 50 | White alpha coverage for button-face tint |

No unique hover, selected, unavailable or red-destroy artwork is needed. Body, cell and button are fixed-proportion images: do not nine-slice or stretch them independently. Apply the common inventory transform to the assembled group.

## Placement and changes from the earlier implementation

Use `layout.json` as the machine-readable layout. Maintain the 1920 × 1080 logical stage and apply `s = min(viewportWidth / 1920, viewportHeight / 1080)` once to the whole group. Existing user drag offset remains separate from the initial origin.

| Element | Earlier handoff | This delta |
|---|---|---|
| Inventory group | Stage origin (16, 140), size 924 × 732 | Same origin, size **964 × 732** |
| Character folio | Group origin (0, 68), 450 × 664 | Unchanged |
| Backpack | Group origin (418, 0), 506 × 732 | Same origin, bounds **546 × 732**; parallel-sided body extends 40px farther right |
| New body patch | Not separate | Backpack-local **(40, 160)**, 506 × 572 |
| Grid | Backpack-local (84, 200), 90 × 90 cells, 8px gap | Backpack-local **(101, 224)**, **90 × 74** cells, same 8px gaps |
| Grid capacity/order | 4 columns × 5 rows | Unchanged: 20 entries in stable row-major order |
| Utility controls | External vertical pixel-art controls | Internal compact horizontal row on the leather front |

Body-local grid origin is **(61, 64)**. For slot `i`, use `x = 61 + (i % 4) * 98`, `y = 64 + floor(i / 4) * 82`. Grid size is 384 × 402. The final row ends at body-local y=466; the front lip begins at y=480, leaving **14px clear space**. Neither the lip nor a decorative overlay may cover a cell, count, item, or hit rectangle. Keep item content within cell-local `(8, 5, 74, 64)` with aspect ratio preserved; fit the icon without cropping it. Keep counts at the lower right and above the icon.

Use the existing twenty inventory controls and item handlers. Replace only their visual backgrounds and layout; suppress their old cell backgrounds in this backpack. Preserve stored indices, stack counts, equipment rules, drag/drop transfers, tooltips and keyboard focus. Do not turn the twenty cells into one flat painted texture.

| Control | Body-local origin | Backpack-local origin | Button size |
|---|---:|---:|---:|
| Refine All | (55, 516) | (95, 676) | 120 × 50 |
| Store All | (187, 516) | (227, 676) | 120 × 50 |
| Drop to destroy | (331, 516) | (371, 676) | 120 × 50 |

All three controls have the same size, horizontal orientation, baseline, shared normal frame and hit area. There is a 12px gap between the safe controls and a 24px gap before destroy. Put the icon at button-local `(4, 5, 40, 40)`. Put live label text inside `(46, 4, 68, 42)`, centered vertically. Match the existing warm cream serif font: about 13.5px for “Refine All” / “Store All”, and 12px on two lines for “Drop to” / “destroy”. Do not bake English text into the PNGs. Allow localization to reduce label size or wrap within that fixed label box.

## Layering and tints

Render the new body first, then live slot backgrounds, slot tints, and item icons/counts. Render utility frames, their masked face tints, and then icons/live labels. Render retained header/spine trim above the patch only in its own masked region. Tooltips and drag ghosts remain above everything. Decorative layers and masks must ignore pointer input; use the existing slot/button controls as hit targets.

To tint, draw a flat color with the supplied mask alpha at the exact same position and size as the corresponding normal asset. Masks are coverage, not textures to display. Keep icons, labels, corner rivets, and brass borders above or outside the tint. The cell mask covers only the inner well.

| State | Starting overlay color |
|---|---|
| Hover | `rgba(255, 221, 155, 0.14)` |
| Selected / focused | `rgba(229, 173, 64, 0.25)` |
| Unavailable | `rgba(25, 21, 20, 0.45)` |
| Valid drop target | `rgba(112, 169, 93, 0.22)` |
| Invalid drop target | `rgba(163, 48, 39, 0.25)` |
| Destroy normal face | `rgba(130, 22, 20, 0.42)` |

Choose one transient tint per target; unavailable overrides hover/selected. On destroy, keep the red normal face as the base, with the current drop/hover tint above it if relevant. Use existing disabled-label behavior; prevent unavailable actions through existing gameplay validation, not through tint alone. These controls need no mechanical movement, so pressing can use the selected tint without a new PNG or layout shift.

## Preserve action semantics

* **Refine All:** call the existing bulk-refine handler for all eligible raw resources in inventory. Do not submit equipment, crafted items, or every inventory entry indiscriminately.
* **Store All:** call the existing plot-storage handler for eligible inventory resources. Preserve capacity, permissions, availability and server validation; leave ineligible items in place.
* **Drop to destroy:** only the item/stack actually dropped on this target enters the existing destroy flow. Preserve the existing quantity/confirmation policy. Clicking this control with no dragged item must never destroy inventory contents. Provide a tooltip such as “Drop an item here to destroy it.”

Remove the old three external visual controls after routing the new controls to the same handlers. Do not leave duplicate active targets. Keep the existing joined-window drag/close behavior: either title moves the joined inventory, and either inventory close invokes the existing inventory-close action. Utility controls and item dragging must not initiate window dragging.

## Integration acceptance

1. Show all twenty slots, including empty slots. Check the top-left and top-right slots sit entirely on the floor, with the same floor width as the bottom row. Test the bottom-left and bottom-right slots with icons and maximum-length counts: no lip overlap and the full hit rectangle remains usable. Walls must read as parallel at all five row heights.
2. Test Refine All with raw resources plus equipment; Store All with eligible and ineligible items, full storage and unavailable storage; and destroy with one dragged item, invalid drop, cancellation and empty click. Match existing behavior.
3. Confirm tint states use the same normal PNGs and masks, with equal button sizes and no positional shifts. Confirm the red destroy face is a button, not an attached patch.
4. Check the new 964px inventory width at 1920 × 1080 and lower desktop resolutions using one common scale. Preserve aspect ratios, text sharpness, focus, counts, and drag ghosts. No touch-specific redesign is included.
5. Inspect the seam with the reused header/spine in the actual game. Hide every part of the old flat body and old cell texture, without masking retained buckles or placing retained art over the new grid.

## Pack verification

The supplied proof is composed directly from the exported PNGs. All 16 exports were checked for RGBA mode, transparent exterior and opaque interiors; 1×/2× dimensions, twenty-cell geometry, equal button bounds and 14px lower-lip clearance were verified. `asset-manifest.json` records dimensions and SHA-256 hashes. `generation-prompts.json` records the art-edit prompts. The proof shows only this replacement region; unchanged inventory art is intentionally not duplicated.
