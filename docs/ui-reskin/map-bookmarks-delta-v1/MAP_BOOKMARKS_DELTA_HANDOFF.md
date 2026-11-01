# Wanderer’s Kit — six map bookmarks / delta v1

Replace only the world-map bookmark appearance with the approved painted-icon and dyed-leather treatment. Order: **Land, Towns, Roads, Regions, Waters, Markers**. The Roads icon is an **unmarked dirt path**, incorporating the final correction removing all modern dashed center markings.

This is a delta to the current set, not a replacement map package. Keep the current map frame, title/close, map aperture, compass, footer, pixel rendering, labels, camera, exploration masking, parchment fog, travel behavior, HUD and other windows. No application repository was supplied; this pack contains assets and integration instructions, not applied game changes.

## Import only these pieces

All paths are relative to this delta’s `assets/` directory.

| Asset | Source pixels | Nominal display | Purpose |
|---|---:|---:|---|
| `bookmark-frame.png` | 336 × 164 | 168 × 82 | One shared leather/stitching border; transparent face opening |
| `bookmark-face-land.png` | 336 × 164 | 168 × 82 | Muted olive-brown face |
| `bookmark-face-towns.png` | 336 × 164 | 168 × 82 | Tawny saddle face |
| `bookmark-face-roads.png` | 336 × 164 | 168 × 82 | Russet umber face |
| `bookmark-face-regions.png` | 336 × 164 | 168 × 82 | Dark sage face |
| `bookmark-face-waters.png` | 336 × 164 | 168 × 82 | Storm-slate face |
| `bookmark-face-markers.png` | 336 × 164 | 168 × 82 | Muted oxblood face |
| `bookmark-face-tint-mask.png` | 336 × 164 | 168 × 82 | White alpha coverage for interaction overlays on the face only |
| `icon-map-land.png` | 256 × 256 | 62 × 62 canvas | Hill/outcrop and tree |
| `icon-map-towns.png` | 256 × 256 | 62 × 62 canvas | Cream village and terracotta roofs |
| `icon-map-roads.png` | 256 × 256 | 62 × 62 canvas | Unmarked winding dirt track |
| `icon-map-regions.png` | 256 × 256 | 62 × 62 canvas | Parchment territory chart |
| `icon-map-waters.png` | 256 × 256 | 62 × 62 canvas | Two cream/teal wave crests |
| `icon-map-markers.png` | 256 × 256 | 62 × 62 canvas | Brass pin, transparent center opening |

PNG format is sRGB RGBA with straight, smooth alpha. Preserve transparent gaps and the pin hole; do not flatten on black or apply the binary-alpha item rule. Faces have a small bleed beneath the frame to avoid seams. Use the frame, face and tint mask at the same rectangle. Their proportions are fixed; no nine-slicing. Icons already have centered padding and optical size balancing: fit the full canvas, do not crop again.

## Lock the leather color

The common frame is cut directly from the approved tab mockup and alpha-isolated; it was **not repainted or recolored for each category**. It carries the approved chestnut leather, tan stitching and restrained brass rim. Every tab and every state must render the same `bookmark-frame.png` with neutral/white modulation, opacity 1 and normal blending. The game’s existing main map frame stays untouched.

Apply category color through the supplied face PNG only. Apply transient and on-state color through the face mask only. Never use a parent-level `filter`, hue rotation, saturation, brightness, tint, blend mode or opacity that also changes the border. If disabled icons are dimmed, target their image layer separately. Do not reuse the older bright orange/cloth bookmark skins beneath this art, and do not regenerate a separate frame for each face or state.

`palette-lock.json` records the approved source references, sampled face medians, border RGB quantiles and color policy. It is a regression reference, not a request to recolor the supplied PNGs at runtime. Future art edits should start from this same shared frame and original map reference, not from a screenshot of a screenshot. Inspect an assembled tab beside the unchanged map leather before accepting a revision.

## Layout and layering

Keep the **current six-tab rail anchors and hit areas** if they already match the screenshot. Place the pieces in the existing button box, scaling all face/frame/mask layers together. The values below are the canonical 168 × 82 logical control layout; use one common transform if the game currently displays it at a larger size. Do not separately scale icon, label, frame and hit target. The global map scale remains `min(viewportWidth / 1920, viewportHeight / 1080)` from the previous handoff.

| Layer | Bookmark-local logical rectangle |
|---|---|
| Category face | (0, 0, 168, 82) |
| State overlay through face mask | (0, 0, 168, 82) |
| Shared frame | (0, 0, 168, 82) |
| Icon | **(98, 10, 62, 62)** |
| Live label | **(20, 20, 78, 42)** |

The icon moves to the **right** and the label to the **left**, following the current approved mockup. Use the existing bundled Spectral 400 face, 18px, warm parchment `#f1dfb7`, vertically centered and left aligned. Keep labels live/localizable; none are baked into the PNGs. Measure longer translations inside the label rectangle; use the existing localization policy rather than letting text paint over the icon.

Layer order is face → masked state tint → shared frame → icon → live label → focus indication. Decorative images and overlays ignore pointer input. Draw the bookmark rail behind the existing map frame so the left attachment edge tucks beneath it. The text/icon region must remain outside the tucked area.

If starting from the **older five-bookmark reference** in `WORLD_MAP_CODING_HANDOFF.md`, update the old order Places / Roads / Terrain / Waters / Markers to the six names above and move the glyph/label to the new rectangles. Keep the reference frame-local rail origin (1316, 170), size 168 × 82, vertical gap 12 and 20px tuck. Six controls span 552px and end at frame-local y=722, inside the retained 800px map frame. Rail bounding width is unchanged. The current screenshot is newer than that five-tab handoff, so do not move a correctly placed current six-tab rail back to legacy coordinates. `layout.json` distinguishes these cases.

## States and behavior

No painted state PNGs are required. Use one normal category face plus one transient overlay through `bookmark-face-tint-mask.png`:

| State | Overlay |
|---|---|
| Hover | `#ffe5ac`, opacity 0.12 |
| Enabled/on | `#f3cd79`, opacity 0.23 |
| Pressed | `#211811`, opacity 0.16 |
| Unavailable | `#171613`, opacity 0.45 |

Suggested precedence is unavailable → pressed → on → hover → normal; keyboard focus remains independently visible. Use a live focus outline rather than a new texture. These bookmarks do not move mechanically when pressed, so keep bounds fixed and use the pressed tint. `bookmark-delta.css` demonstrates the layer/state treatment without implementing any game handlers.

Retain the existing **independent layer toggles**, current layer IDs, defaults, persisted settings, unavailable conditions, tooltips, input ownership and keyboard behavior. These are not an exclusive tab group: several layers may be on together. Keep `aria-pressed` or the engine equivalent synchronized with the real enabled boolean. Clicking must change the existing relevant renderer layer, not just its tint. The six names are presentation labels; do not invent a new engine API or rename persisted keys just to match PNG filenames. In particular, do not assume older Places/Terrain were exact one-to-one engine equivalents of Towns/Regions. Bind to the current six controls already shown in the screenshot.

Remove the old bookmark normal/state skin assignments and old glyphs from these six controls once the new layers are installed. Scope the replacement to the world-map bookmarks; other buttons retain their current skins. Keep all category toggles operational, preserve unavailable gating and avoid duplicate old hit targets.

## Verify in the game

* Compare beside the unchanged map frame: shared borders should keep the same chestnut hue and tone when switching categories or interaction states. Text/icons should fit at the actual desktop scale and remain readable at the six-tab rail’s current size.
* Check the road icon has no painted center dashes or modern lane stripe. Check the pin opening and negative spaces between waves remain transparent, with no dark rectangular extraction backgrounds or brown halos.
* Enable multiple layers, toggle each one off, test unavailable and focus/pressed states, and reopen the map to check saved choices. Verify actual geography/label/marker layers respond exactly as before.
* Test current desktop sizes and the existing minimap clearance policy with all six tabs visible. Do not change map aperture, camera registration, nearest-neighbor terrain sampling, exploration mask, paper fog or travel targets as part of this visual delta.

## Supplied verification and references

`MAP_BOOKMARKS_DELTA_PROOF.png` is assembled from the production pieces with example live-type labels and state tints. `MAP_BOOKMARKS_CONTEXT_PREVIEW.png` places those pieces over the supplied screenshot; it is documentation, not a runtime background. Neither preview should replace the generated map.

The 14 production PNGs were checked for RGBA mode, dimensions and alpha range. The frame’s opaque pixels were verified identical in normal, hover, on and unavailable compositions. The six-control legacy rail geometry was checked against the old frame height. `asset-manifest.json` records file hashes; `generation-prompts.json` records the built-in image-generation art prompts, including the unmarked-road correction. The border was technically extracted from the approved mockup to avoid a new generation color shift. Engine integration and gameplay tests remain for the coding agent.
