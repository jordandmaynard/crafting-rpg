# Wanderer’s Kit — Refining frames handoff

Use one of four bespoke window shells for Saw Table, Grinder, Smelter or Tanning Rack. Match the attached reference’s material identities: timber and saw-blade trim; millstone, masonry, wheat and linen; dark forge stone and iron with border embers; or timber, rope, hide and bone ties.

Only window/frame elements are new. Do not generate or substitute a new center machine icon or progress bar. Place the game’s existing building-mode icon and existing progress renderer into the reserved hosts. The reference assembly intentionally leaves those hosts empty. The small saw blade, millstone, ore and hide motifs in the outer header/border are decorative frame artwork.

## Files and import

Install `ui/refining/`, `css/refining.css` and Spectral 400/600 with the OFL license. Keep the CSS-relative image/font paths, or update them through the normal asset pipeline. PNGs are sRGB straight RGBA; each is 2× its stated nominal display size. Transparent exterior pixels have zero RGB. Body parchment/slate and empty slot wells are opaque. Do not add a second center fill beneath the included shell.

The four `frame-{station}.png` files include the complete outer border, header ornament, blank title plaque, blank close housing and clear body background. They contain no words, slot grids, center icon, arrow or progress graphics. Item slots and normal close-housing overlays are separate assets. No state-image variants are needed. All titles, section headings, ×, item icons, counts, status and progress values are live layers.

These are fixed-size skins, rather than generic runtime nine-slice frames. Set `background-size:100% 100%` at the exact nominal aspect ratio, then scale the complete window uniformly. Slice insets/outsets are zero; shadows are CSS. This preserves saw teeth, stone blocks, stitched leather and rope joints. `manifest.json` provides exact source/display dimensions, content insets, states and hashes; `layout.json` is the placement contract.

## Geometry and changes from Desktop V3

The new shell is **800×480** logical pixels, replacing the previous 720×500 station shell for these four skins. The larger width follows the supplied reference’s wide proportions. Slots remain **110×110**. There are **four inputs and four outputs**, each 2×2; do not restore the superseded eight-output layout.

Use the existing desktop group scale `s = min(viewportWidth/1920, viewportHeight/1080)`. Apply it once to the whole station group. The standalone example centers the group; the existing game window manager may retain drag/position behavior.

When shown beside the V3 inventory, an example origin is logical `(972,286)` at 1080p, ending at `(1772,766)`. It leaves 32px between the V3 inventory’s right edge at 940 and the new station’s left edge. Keep the inventory/HUD geometry unchanged; resize/reposition the station container for its new footprint. The example is a placement suggestion, not a new game API or permanent anchor requirement.

| Shared element | Window-local x,y,w,h | Instructions |
|---|---|---|
| Input heading | 60,150,228,26 | Live Raw Materials; Spectral 600, 20px. |
| Output heading | 512,150,228,26 | Live Refined Goods; same typography. |
| Input grid | 60,176,228,228 | Two columns/two rows; 110px cells and 8px gaps. |
| Output grid | 512,176,228,228 | Four output cells, same geometry. |
| Existing building icon host | 302,184,166,154 | Contain the game’s current icon without stretching its aspect ratio. |
| Existing arrow host | 470,242,38,42 | Reuse the existing arrow if needed; no new arrow art included. |
| Existing status/progress-label host | 300,348,196,24 | Live processing state; no baked text. |
| Existing progress host | 306,376,188,18 | Adapt/reuse the existing track/fill rendering. No new progress skin. |

Each slot is a separate real UI target, with row-major indices 0–3. The shell is not a screenshot to place over the game’s old small cells. Move/resize the actual input/output controls to the new rectangles, preserving their existing item identities, stack rules, transfers and drag behavior. Center item icons at slot-local `[13,13,84,84]`; place live counts near right 12/bottom 9 as demonstrated by the supplied optional CSS classes.

Header plaques and close housings follow each frame’s construction, so their rectangles differ by skin. Use these exact values rather than reusing one header offset:

| Skin ID | Title x,y,w,h | Close x,y,w,h |
|---|---|---|
| `saw-table` | 290,53,293,54 | 705,52,43,42 |
| `grinder` | 292,55,243,54 | 718,46,47,49 |
| `smelter` | 293,46,241,47 | 705,53,43,43 |
| `tanning-rack` | 270,47,253,52 | 673,43,58,53 |

Titles use Spectral 600 at 28px. Main headings use dark brown on the parchment/hide skins and warm ivory on the Smelter’s slate body. The Smelter’s metal title plate still uses dark title text. The CSS applies these per-skin colors. The header positions are deliberate exceptions; all grid and center-host positions remain identical across the four stations.

## Markup and behavior wiring

`preview.html` contains complete markup for every skin; `example.html` demonstrates the scaling wrapper. Use `.rf-window[data-station="saw-table"]` and the corresponding skin IDs to select the shell and theme variables. `.rf-inputs` and `.rf-outputs` hold four `.rf-slot` buttons each, with `data-kind="input"` or `output` and `data-slot-index="0"` through 3.

The `.rf-close::before` background is one normal station-specific overlay matching the empty housing already in the shell. Hover, press and unavailable treatment are runtime tints of that image. Its × is live text. Bind it to the existing station-close command. If the existing window manager drags from the header, exclude close from that drag handle. Avoid duplicate title bars, generic borders, old station skins or old center panel fills over these assets.

The `.rf-center-host`, `.rf-arrow-host`, `.rf-status-host` and `.rf-progress-host` are intentionally empty in the proof. Mount the existing assets/renderers there and feed them the current station state. Keep the same progress calculation, pause/completion behavior, transfers and conversion rules. No gameplay logic or automatic refining behavior is introduced by this package.

The example close and slot buttons have no game callbacks. They exist to demonstrate art placement, native focus and CSS states. Reuse the game’s current event handlers and input/modal policy. Do not treat the static preview as a replacement station controller. Map these visual skin IDs to actual game station IDs in the adapter; no engine-specific function names or selectors are assumed.

Slot states are normal, hover, selected, pressed, focus, drop and unavailable. One normal image supplies all states. The skin is painted on `::before`, and CSS filters tint that surface so live icons/counts are not accidentally recolored. Input/output art is distinct where the reference calls for it, especially the Grinder’s pale refined-goods rim. Set `data-drop="true"` only for an accepted drag target; use the game’s existing rejection feedback for invalid items. Use `data-selected="true"` when the game has a selected cell. Keep keyboard focus visible with the CSS outline, independently of selection or item contents. Use the native `disabled` property when an action is unavailable. `data-unavailable="true"` supplies a visual tint for existing custom controls, but its handler must also reject unavailable actions; a tint is not an interaction guard. Do not infer acceptance rules from slot color.

No center/progress files are included, and no replacement item icons were made. This package leaves prior crafting, inventory, HUD and world-map assets intact. It adds only the four station frame themes and their component skins.

## Verification and art provenance

The blank shells and slot sheet were generated from the supplied reference with the built-in image generator. Exports use technical cropping, uniform frame fitting/padding and normal slot normalization. All visual interaction states use runtime CSS tints; the former derivative state PNGs have been removed. Original generated art was 1619×971; full frames are uniformly fitted into 1600×960 delivery canvases. The prompt set is in `PROMPTS.json`. The artwork contains no baked labels or live gameplay values.

`browser-validation.json` covers four skins at five desktop resolutions, all 16 normal PNGs loading, common grid placement, four inputs/four outputs, empty center/progress hosts and aligned runtime hover/selected/pressed/focus/drop/unavailable states. `asset-validation.json` covers formats, ICC profiles, dimensions, alpha, hashes and relative links. These validate the delivered art/CSS assembly. Actual station interactions, input ownership and progress integration still need to be checked in the game.

## Shared state-art policy

Use one normal frame/button image as the source for hover, selected and unavailable states. Apply live tints/filters instead of exporting duplicate PNGs. Pressed states also reuse the normal image when a tint or simple CSS offset is sufficient. Make separate art only when the state changes actual shape, depth, silhouette or geometry that cannot be represented with a tint/transform. None of these refining controls needs a unique state image. See `UI_STATE_POLICY.md` for the reusable policy and `asset-proof.html` for the live examples.
