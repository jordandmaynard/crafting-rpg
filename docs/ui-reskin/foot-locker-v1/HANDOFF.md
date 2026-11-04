# Wanderer's Kit — Foot Locker inventory handoff

## Deliverable

The approved wood-and-iron **open foot locker** treatment, without the baked-in **“Foot Locker”** text and without the close (`X`) button. The lid, beige cloth, iron hinges, recessed chest walls, and exactly **15 square slots in a 3 × 5 grid** remain part of the art. No leather outer frame or parchment header has been added.

All exported PNGs are RGBA with a transparent exterior. Native art canvas is **1199 × 1312** pixels, with origin at top-left. Display at uniform scale. Do not stretch the grid independently, or the squares may distort.

## PNGs

| File | Purpose | Draw position on native canvas |
| --- | --- | --- |
| `assets/foot_locker_full_blank.png` | Easiest single-background implementation | `(0, 0)` |
| `assets/foot_locker_lid.png` | Separated top lid, wood banner and cloth | `(0, 0)` |
| `assets/foot_locker_body.png` | Lower chest body including the 15 slots | `(0, 468)` |
| `assets/slot_icon_clip_mask.png` | Optional rounded-square icon clipping mask | Apply in a 144 × 144 slot rect |
| `assets/slots/foot_locker_slot_r*_c*_inset.png` | 15 individual 144 × 144 native wood insets, optional reference/reuse | Position from `slot_layout.json` |

**Important:** Either draw `foot_locker_full_blank.png` **or** assemble `foot_locker_lid.png` plus `foot_locker_body.png`. Do not draw the full frame and the separated layers together. The split is a static pixel-perfect compositing split, **not** an animation-ready hinged lid.

## Dynamic overlays

- **Title:** Render your existing Wanderer's Kit serif font in the wooden top band; suggested text region `x=126, y=90, width=754, height=87` (native pixels). No lettering is baked in.
- **Close:** Reuse your current X-button sprite; suggested center at `(1040, 127)`, but adjust if that button is larger or smaller than the former one. There is no close-button art baked into the background.
- **Slots:** 3 rows × 5 columns, 15 total. The boundaries, brass rivets and wood backing are already painted into the chest. Draw icons on top of the empty insets. Avoid drawing separate slot borders on top of the built-in frames.
- **Coordinates:** Use the 15 `slot_icon_areas` from `slot_layout.json` in **row-major order** (left to right, top to bottom, zero-based `index`). These are 144 × 144 safe content regions, not the entire painted beveled slot footprint.
- **Icon fit:** Allow internal padding (e.g. 8–12 pixels at this source scale), or clip to the optional rounded-square mask. Render quantities on top in the existing UI style.
- **Hover/selection:** Programmatic overlays are preferred, using a lightly tinted 144 × 144 rectangle or border inside the painted frame. Do not tint the whole foot locker artwork.
- **Scaling:** With displayed scale factor `s`, slot overlay x = frameX + `s * slot.x`, y = frameY + `s * slot.y`; widths/heights also multiply by `s`. Use one common scale value on both axes.

## Quality notes

- Exterior transparency is extracted from the generated blank illustration, rather than sourced from a layered authoring file. Inspect edges over your actual background for any dark fringe.
- Slot insets are crops of the finished static art; if you use those as standalone backgrounds in other UIs, the surrounding bronze framing is not included. The primary foot locker interface **already has all 15 slot frames painted in**.
- The original approved art is a raster illustration. These assets provide clean static components and geometry, not editable vectors or 3D geometry.

## Preview references

- `previews/full_preview_checkerboard.jpg`: cleaned, unannotated static frame over a checkerboard.
- `previews/placement_guide.jpg`: slot rectangles and suggested text/button overlay positions; **not** production art.
