# Axe and hammer ability icons — C silhouette set

Six individual 256 × 256 RGBA PNGs, sRGB, alpha 255 throughout. Artwork and backgrounds fill the square; these are ability images, not transparent inventory item sprites.

| Weapon | Slot | Ability | File |
| --- | --- | --- | --- |
| Axe | Basic | Axe Swing | `icons/ability-axe-swing-c-256x256.png` |
| Axe | Q | Boomerang Throw | `icons/ability-axe-boomerang-c-256x256.png` |
| Axe | E | Rend | `icons/ability-axe-rend-c-256x256.png` |
| Hammer | Basic | Hammer Swing | `icons/ability-hammer-swing-c-256x256.png` |
| Hammer | Q | Ground Smash | `icons/ability-hammer-ground-smash-c-256x256.png` |
| Hammer | E | Charge | `icons/ability-hammer-charge-c-256x256.png` |

## Visual intent

- Basic attacks: blue swing arcs with blocky hands.
- Axe Q: an airborne single-bladed axe with a looping return trail.
- Axe E: three outward-facing axes in a stationary red spin, matching the sword Whirlwind composition.
- Hammer Q: a central ground impact with expanding gold rings and two stun stars.
- Hammer E: two blocky hands drive the oversized hammer ahead as a battering ram, with straight red charge trails.
- Silhouette proportions follow the wood axe and wood hammer item icons. The hammer retains its oversized tall block head.

## Import and UI handoff

Use the files in `icons/` as square UI textures. Render at the existing ability icon size, with aspect ratio 1:1 and no content crop. Use bilinear filtering for scaled UI, sRGB color sampling, and avoid lossy texture compression that breaks the thin colored rims. The contact sheet shows actual 64, 48, and 32 pixel downsamples for review.

Place the existing Wanderer's Kit ability frame above these images. Keybindings, cooldown masks, resource/unavailable feedback, and selected/hover tints belong to runtime UI layers; they are not baked into the artwork. Use normal art for interaction states and apply tints at runtime.

The comparison sheet and this README are review/handoff material, not game textures. `manifest.json` provides exact names, slots, palette, sizes, and hashes. `generation-prompts.json` records artwork directions.

## Final selected hammer version

The hammer basic uses the exact version selected by the user, without artistic edits. The selected full-resolution source is preserved byte-for-byte at `source/hammer-swing-approved.png`. The production PNG is a direct high-quality 256 × 256 downsample of that source. Use this source as authoritative for future re-exports; generation prompts record artwork history and do not supersede the approved image. The approved axe and all four Q/E icons are unchanged. Existing import filenames are retained.
