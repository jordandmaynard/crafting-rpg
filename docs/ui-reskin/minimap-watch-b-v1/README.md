# Wanderer’s Kit — Minimap + Celestial Watch Strip B v1

Production pieces for the selected compact B treatment: an integrated leather/brass minimap case, parchment place plate, engraved watch bezel, fixed index, separate compass and moving sun/moon markers.

11 production PNGs, reference CSS, a working watch-strip renderer, exact layout metadata and coding instructions are included. Hover, selected and unavailable feedback use live tints of the normal compass face.

## Review

- Open `preview.html` in a modern desktop browser. Use the period buttons, phase slider or Play cycle to inspect the scrolling and crossfades.
- `preview.html?dock=1` demonstrates the top-right desktop anchor; Compact for world map uses the smaller world-map-open footprint.
- `asset-proof.html` shows the individual cut pieces, transparent openings and four sky textures.
- `minimap-b-preview.png` shows afternoon and dusk assemblies. `watch-periods-and-crossfades.png` shows the sky transitions.
- Give the coding agent `MINIMAP_WATCH_HANDOFF.md`, `ASSET_SPEC.md`, `manifest.json`, `layout.json`, `transitions.json`, `ui/minimap/`, `css/minimap-watch.css`, `js/celestial-watch.js` and the Spectral font files/license.

## Behavior

The sky scrolls horizontally, using one shared offset for all four lighting layers. Night→dawn→day→dusk→night transitions use smooth crossfades inside the sky aperture. The sky remains opaque. The bezel, tick scale, place plate, labels, compass and center index do not fade or scroll. Sun/moon are independent sprites on a wrapping celestial track.

The production renderer has no clock or perpetual animation loop. The game supplies its normalized sun-cycle phase and existing period label. The preview’s 45-second cycle is demonstration code only. `transitions.json` gives editable phase anchors; real game timing remains authoritative.

## Integration

The full stack is 315×378 logical pixels at 1080p, anchored right 20/top 18 before the common desktop scale. The main map opening/labels differ from V3; follow the new geometry. Keep the game’s pixel map and parchment exploration/fog renderer. The screenshot crop in `demo/map-content.png` is an illustration only and is uniformly cropped, never stretched.

The world-map-open compact multiplier becomes 0.70 to clear its bookmarks. The handoff also gives revised refining-window clearance for the taller stack. No prior package or game repository was modified; this add-on supplies the replacement minimap/watch pieces and integration reference.

`browser-validation.json` and `asset-validation.json` record phase-weight, opacity, wrap, tint, anchor and asset checks. `PROMPTS.json` records the built-in image-generation prompts and technical preparation.
