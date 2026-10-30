# Sandstone, sand and glass item icons

- rough-sandstone-48x48.png: rough stone in sandy beige and ochre.
- sand-pile-48x48.png: loose golden sand mound.
- glass-pane-48x48.png: thin pale cyan glass sheet with white reflection bands.

All icons are exactly 48×48, including the one-pixel black outer contour. Alpha is binary (0 or 255); glass uses opaque colors to suggest its material. Black is only on the alpha boundary. All three pass checks for zero interior black pixels, zero solid 2×2 black blocks, and complete contours.

Use nearest-neighbor filtering, integer display scales and whole-pixel placement. Preserve alpha, avoid lossy compression, and do not add another outline. These item views are not constrained to building-style 2:1 isometric.

The atlas is 144×48 with three 48×48 cells in the order above, without spacing. The labeled preview shows actual final pixels at 4× scale; its background and labels are review-only.

Artwork used built-in image generation followed by exact-size pixel cleanup. PROMPTS.json retains the prompt set and validation.json records checks.
