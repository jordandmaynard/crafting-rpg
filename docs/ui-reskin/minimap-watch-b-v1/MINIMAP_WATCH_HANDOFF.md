# Wanderer’s Kit — Minimap and watch-strip B handoff

Replace the current minimap casing and detached pixel-art day strip with the selected B design. The minimap, parchment location plate and narrow celestial watch aperture form one continuous leather/brass case. Use the supplied cut PNGs as separate layers; the game’s map, place name, time label, clock and north-lock behavior stay live.

This is an add-on with new minimap geometry. It does not modify a game repository or replace any gameplay system. The older Desktop V3 minimap dimensions and the world-map package’s0.9 compact factor are superseded for this component by the values below.

## Files and layer order

Install `ui/minimap/`, `css/minimap-watch.css`, `js/celestial-watch.js`, the Spectral 400/600 font files and OFL license. All 11 production PNGs use straight RGBA/sRGB. Shapes are fixed at 2× nominal display size, zero nine-slice insets, zero image outsets; shadows are CSS. Do not stretch the frame into a different aspect ratio or scale its two sections independently.

| Layer, back to front | Asset / content | Purpose |
|---|---|---|
| Live map | Existing game minimap canvas/renderer | Pixel terrain and parchment fog, rendered for the new viewport. |
| Watch sky | `CelestialWatchStrip` canvas | Scrolling opaque sky with phase crossfades and moving sun/moon. |
| Upper case | `minimap-frame.png` | Leather/brass frame and blank parchment place plate; transparent map opening. |
| Watch case | `watch-bezel.png` | Integrated lower case and fixed cream tick scale; transparent sky opening. |
| Text | Live place and time strings | Spectral, dark brown on parchment. |
| Compass | `compass-face.png`, live N, `compass-needle.png` | Normal face, upright N and separately rotating needle. |
| Fixed index | `watch-index.png` | Stationary diamond/pointer at the center of the watch scale. |

The case sections are cut from one normalized master at logical y300: upper 315×300 and lower 315×78. They meet at the same coordinate with no gap/overlap. Keep them in one scaled parent to avoid fractional seams. The bezel and scale are one static piece; the index is separate. Sky art has no baked sun or moon, and the face has no baked N or needle.

## Exact placement

Use the V3 group scale `s = min(viewportWidth/1920, viewportHeight/1080)` once. The full stack is **315×378** logical pixels, anchored **right 20, top 18** on the actual viewport. At 1080p its top-left is `(1585,18)` and its bottom is 396. Do not retain the detached pixel strip underneath it.

| Element | Group-local rect x,y,w,h | Notes |
|---|---|---|
| Upper case | 0,0,315,300 | Source 630×600. |
| Watch bezel | 0,300,315,78 | Source 630×156. |
| Live map host | 24,33,266,193 | Clip radius 8. Small bleed beneath painted rim. |
| Approximate visible map opening | 25,34,264,191 | Frame masks the viewport edge. |
| Place label | 30,235,255,32 | 24px Spectral 400. |
| Time label | 30,267,255,24 | 18px Spectral 400; existing game period string. |
| Compass face/button | 229,30,68,68 | Source 136×136, normal art only. |
| N within compass | 14,6,40,25 | 23px Spectral 600, upright. |
| Needle within compass | 24,32,20,28 | Up-authored; rotate about 50% 60%. |
| Sky canvas/clip | 21,315,272,34 | Clip radius 6; paints beneath rim. |
| Approximate visible sky opening | 22,316,270,32 | Bezel masks the small bleed. |
| Fixed index | 149,299,16,30 | Center aligns with canvas center at group x157. |

`layout.json` is the exact numeric contract; `manifest.json` provides sizes/hashes. Coordinates above precede scaling. Body text color is `#302012`, compass N is `#f7e4b9`. Text is live and can be localized. Long place/time strings ellipsize in the reference; retain full strings in tooltips/accessibility labels when adapting the game.

## Clearance from other windows

The previous minimap frame was 315×300 plus a separate day strip. The new integrated stack is 315×378. Reserve its full rectangle rather than only the old map body.

- When the large world map is open, use **compactScale 0.70**, replacing the old 0.90 example. With top 18 unchanged, the new height is 264.6 and its bottom is 282.6, leaving 17.4px above the world map’s first bookmark atlogical y300. The CSS demonstrates this via `.wk-mini-dock[data-world-map-open="true"]`. Restore 1 on close. Keep the actual top/right anchors; do not multiply those offsets by compactScale too.
- The refining-frame package’s earlier example origin `(972,286)` overlaps the taller minimap. For the new 800×480 refining shells, a clear right-side anchor is **right 20, top 420**, ending at logical y900. This leaves 24px under the minimap and 39px before the bottom ability HUD near y939. Apply the same global scale. Update the station window manager’s default/reset position or keep dragged windows outside the reserved HUD rectangle.
- Inventory and centered crafting windows can retain their current anchors. Other HUD/overlay managers should reserve the new top-right rectangle and apply their existing collision policy.

These are concrete placement changes for the coding agent, not new controls. The package does not automatically alter the old world-map/refining source files.

## Scrolling and crossfading — required implementation

Use the game’s sun-cycle phase as the single source of truth. The reference contract is `p∈[0,1)`: 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk. Normalize with `((p%1)+1)%1`. If the game uses a different zero or unequal day/night timing, convert it into this display phase using the game’s existing cycle anchors. Do not drive production time with Date.now, a browser timer or the preview’s play loop.

The four separate opaque sky textures need crossfading. Their cloud geometry is similar and they share the same UVs, but their lighting differs. Use these default graphical anchors or adapt them to the game’s authoritative dawn/dusk settings:

| Phase interval | Sky treatment |
|---|---|
| 0–0.19 | Night hold |
| 0.19–0.25 | Night → dawn |
| 0.25–0.31 | Dawn → day |
| 0.31–0.69 | Day hold |
| 0.69–0.75 | Day → dusk |
| 0.75–0.81 | Dusk → night |
| 0.81–1 | Night hold; wraps to the same night state at 0 |

Between adjacent anchors, calculate `u=(p-a)/(b-a)` and `t=u*u*(3-2*u)`; blend `A*(1-t)+B*t`. The first and last keys must be the same sky. `transitions.json` contains the complete default key list, and the renderer accepts replacement keyframes. The game’s existing period label remains authoritative and need not change at exactly these illustrative color boundaries.

**Keep the crossfade opaque.** In a two-layer CSS implementation, draw the outgoing sky fully opaque underneath and fade the incoming layer from 0 to1 above it. Do not give both source-over layers inverse partial opacities over transparency; that causes a dim/translucent mid-transition. The supplied canvas renderer paints the first active layer opaque and adds subsequent layers at their normalized accumulated weight. It was checked against expected RGB blending and alpha255 through all transitions.

All four layers use the **same horizontal offset and scale**, including during a dissolve. Their 1024×128 textures are 8:1; at the reference 272×34 aperture, one tile is exactly272px wide. Pan by `offset=-p*272` and repeat horizontally. The exported left/right columns match; the textures have a smooth boundary correction for looping. On wrap, the offset changes by exactly one repeated tile, producing the same image. Do not restart a CSS easing animation at midnight or animate the four layers at independent speeds.

Only sky content crossfades. The leather case, tick scale, place plate, index, compass and text remain opaque and stationary. Keep the canvas clipped beneath the bezel. Do not fade the whole minimap, repaint its terrain to match the sky, or put a moving sky rectangle over the map.

## Sun/moon track and fixed indicator

Sun and moon are independent sprites. The strip shows a cyclic celestial timeline through a fixed window: past to the left, future to the right, current phase at the fixed center index. The reference track circumference is `C=1.4*apertureWidth`; noon’s sun marker has phase 0.5 and midnight’s moon marker phase 0.

For an event phase `e`, compute `d=(((e-p+0.5)%1)+1)%1-0.5`, then `x=W/2+d*C`. Wrapped marker-position jumps occur outside the visible window. Sun is centered at noon; moon at midnight. At dusk the sun leaves on the left and moon enters on the right; dawn reverses their roles. The sun moves toward the lower edge near the horizon and is clipped/faded as it sets. The supplied renderer contains the vertical/visibility calculations. Moon is a night marker, not an astronomical lunar-phase simulation.

The sun/moon markers are not baked into the four sky images, so the code never needs to crossfade duplicate suns or moons. The static engraved ticks are an ornamental instrument scale; they do not claim numbered game-hour calibration. The live period label communicates the current named time. Keep the diamond index fixed at group `[149,299,16,30]`.

## Reference renderer and adapter example

Include `js/celestial-watch.js` after the markup in `preview.html`. The production class owns only the watch canvas: loading images, rendering sky blends/markers and resizing its drawing buffer. It has no game clock, map camera or perpetual animation loop.

```js
const strip = new CelestialWatchStrip(watchCanvas, {
  assetBase: '/ui/minimap/',
  phase: initialDisplayPhase,
  pixelRatio: devicePixelRatio * hudScale * compactScale
});
await strip.ready;

// Call from the game's existing clock-update path.
function updateWatch(displayPhase, existingPeriodLabel) {
  strip.setPhase(displayPhase);
  timeLabel.textContent = existingPeriodLabel;
}

// Call when resolution, device scale or compact mode changes.
strip.resize(devicePixelRatio * hudScale * compactScale);
```

`watchCanvas`, `initialDisplayPhase`, `hudScale`, `compactScale` and `timeLabel` above are adapter inputs, not claimed existing project APIs. Methods are `setPhase`, `setKeyframes`, `resize`, `draw`, `frameState` and `destroy`. `ready` resolves after the required imagery loads. Invalid/nonfinite phases are rejected. For unavailable clock data, retain the last valid phase or apply the game’s existing unavailable treatment; do not invent a local time source.

The renderer clamps its effective pixel ratio to 1–4. The canvas remains 272×34 logical pixels in CSS. Resize the drawing buffer for devicePixelRatio×actual displayed scale without applying the HUD scale twice. The demo reads the transformed aperture width to demonstrate this. The map canvas retains its own pixel-art sampling rules; the sky uses smooth artwork sampling.

## Map and compass integration

Render the existing game minimap at the new 266×193 host aspect ratio using its real camera/world-coordinate extent. Do not stretch an old square or other-aspect viewport canvas into this rectangle. Resize/re-render its viewport, or uniformly crop a raster if appropriate. Keep nearest-neighbor/pixelated terrain rendering and the existing parchment exploration/fog treatment. Put opaque parchment beneath unknown pixels if that renderer currently uses transparency. The shell’s transparent hole is not fog-of-war content.

The preview’s `demo/map-content.png` is a crop of the supplied game screenshot, uniformly covered/cropped in the aperture. It is not production world or exploration data. Replace it with the actual live minimap renderer. The new compass is drawn separately above it.

The compass uses one normal face and CSS hover/selected/unavailable tints, following the shared state-art policy. Keep N and the face upright; rotate only the up-authored needle from the game’s existing heading/north-lock state, adjusting sign/zero offset if the old needle used a different orientation. Bind the button to the actual north-lock command and reflect confirmed game state. The preview’s local toggle is demonstration behavior only. Preserve map-click/open-world-map behavior and the game’s existing UI input ownership.

Remove the old detached pixel time-strip DOM/canvas and its pixel sun/moon glyphs after the replacement is mounted. Keep one authoritative clock source, one compass command binding and one minimap renderer.

## Verification and provenance

The blank case, instrument parts and four-sky sheet were prepared with the built-in image generator from concept B, then technically cut, fitted, normalized and edge-corrected. `PROMPTS.json` records the prompts. Parts are separate; labels stay live. The exact source/export sizes and hashes are in `manifest.json` and `ASSET_SPEC.md`.

`browser-validation.json` records four phase peaks, normalized blend weights, opaque transitions, expected RGB mixing, exact 0/1 wrap, near-midnight continuity, sun/moon positions, single-image compass tint/focus and normal/compact anchors at five desktop resolutions. `asset-validation.json` records alpha, tile boundaries, file sizes/hashes and link checks. Actual game clock mapping, minimap renderer resizing, input ownership and window-manager placement still need to be checked in the game.
