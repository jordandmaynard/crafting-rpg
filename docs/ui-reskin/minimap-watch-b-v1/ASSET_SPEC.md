# Minimap and Celestial Watch Strip B — asset specification

11 production PNGs, sRGB straight RGBA, 2× nominal display scale. Fixed shapes have zero slice insets/outsets, no image repeat and CSS shadows. Sky textures repeat horizontally and scale to the watch-aperture height. All text is live. Interaction feedback reuses the normal compass face with CSS tints.

| File | Export pixels | Nominal display pixels | Placement / use |
|---|---|---|---|
| `ui/minimap/minimap-frame.png` | 630×600 | 315×300 | 0,0 in group; blank place plate and transparent map opening |
| `ui/minimap/watch-bezel.png` | 630×156 | 315×78 | 0,300 in group; sky opening transparent, engraved scale stays fixed |
| `ui/minimap/compass-face.png` | 136×136 | 68×68 | 68×68 normal face behind live N and independent needle |
| `ui/minimap/compass-needle.png` | 40×56 | 20×28 | 20×28; points up at zero; rotate about 50% 60% |
| `ui/minimap/sun.png` | 72×72 | 36×36 | 36×36 marker, drawn by watch renderer |
| `ui/minimap/moon.png` | 56×56 | 28×28 | 28×28 marker, drawn by watch renderer |
| `ui/minimap/watch-index.png` | 32×60 | 16×30 | 149,299; 16×30, remains fixed |
| `ui/minimap/sky-day.png` | 1024×128 | 512×64 | Opaque scroll/crossfade layer |
| `ui/minimap/sky-dusk.png` | 1024×128 | 512×64 | Opaque scroll/crossfade layer |
| `ui/minimap/sky-night.png` | 1024×128 | 512×64 | Opaque scroll/crossfade layer |
| `ui/minimap/sky-dawn.png` | 1024×128 | 512×64 | Opaque scroll/crossfade layer |

The full case was uniformly fitted from 1163×1352 to 630×732, centered vertically in a 630×756 canvas, then cut at source y600 (logical y300). The two case sections adjoin exactly; do not scale them separately. Cropped atlas parts were uniformly fitted into their sprite canvases. No text is baked in.

The four sky bands were extracted from a matched lighting sheet, normalized to 1024×128, made opaque and corrected smoothly at their horizontal boundary. First/last columns are identical. This permits repeat-X scrolling. All four layers use the same sampling coordinates while their opacities crossfade. Their cloud geometry is visually similar but not pixel-identical, so a slow dissolve may morph some painted wisps.

The image-generator prompts are in `PROMPTS.json`. `manifest.json` contains hashes and exact export fields. The screenshot map in `demo/` is fixture content only; use the actual game map and exploration/fog renderer.
