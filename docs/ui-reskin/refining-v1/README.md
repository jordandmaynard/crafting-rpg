# Wanderer’s Kit — Refining frames v1

Production window/frame art for Saw Table, Grinder, Smelter and Tanning Rack, based on the supplied four-station reference.

The package contains 16 text-free normal PNGs: four bespoke empty window skins, eight separate input/output slot skins, and four matching close-button housings. Hover, selected, pressed, drop and unavailable states are live surface tints; keyboard focus uses a CSS outline. Title plaques and header ornaments are integrated into the empty shell. Titles, labels, item icons and counts remain live UI.

No center machine icons, arrows, progress tracks, fills or progress labels were created. The working area is clear for the game’s existing building-mode icons and progress display. The small station ornaments in the outer borders remain part of the frame art.

## Review and handoff

- `preview.html` shows all four assembled frames with empty slots and live headings.
- `single.html?station=saw-table` shows one frame at its nominal size. Other skin IDs: `grinder`, `smelter`, `tanning-rack`.
- `example.html?station=grinder` demonstrates desktop viewport scaling.
- `asset-proof.html` shows all delivered skins/states.
- `refining-set-preview.png` and the four individual preview PNGs show actual assemblies from delivered assets.
- Give the coding agent `REFINING_FRAMES_HANDOFF.md`, `ASSET_SPEC.md`, `manifest.json`, `layout.json`, `ui/refining/`, `css/refining.css` and the Spectral fonts/license.

Each shell is 800×480 logical pixels, exported at 1600×960. This replaces the prior 720×500 refining-shell footprint for these variants. Input and output slots remain 110×110, four of each in 2×2 grids, with 8px gaps. The guide specifies the geometry and integration changes.

This is a frame-art add-on. There is no new refining logic, item-transfer behavior or center/progress renderer. Preview buttons demonstrate visual states; game callbacks are intentionally left to the existing implementation. Prior inventory, crafting, map and HUD packages are not overwritten.

`browser-validation.json` records all four skins at five desktop resolutions and live tint-state checks. `asset-validation.json` records file-level checks. `PROMPTS.json` records the built-in image-generation prompts. `manifest.json` lists exact dimensions, insets and hashes. `UI_STATE_POLICY.md` records the shared state-art policy.
