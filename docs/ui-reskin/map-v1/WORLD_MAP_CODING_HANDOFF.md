# Wanderer’s Kit — World Map coding handoff

Implement the world map as a leather-and-brass folio with a raised title, five cloth bookmark toggles and opaque parchment in unexplored territory. Keep the game-generated terrain pixel-based. Use the included assembled preview as the visual target; use the approved mockup in `demo/approved-map-reference.png` to judge materials and composition.

This package is an add-on to Desktop V3. It does not replace the previous inventory, refining window or HUD asset package. No application repository or engine integration has been edited here.

## Assets and layout

Install `ui/map/`, `css/world-map.css`, `js/world-map.js` and the bundled font files with their OFL licenses. `manifest.json` is the exact PNG inventory with source sizes, nominal display sizes and SHA-256 hashes. `layout.json` is the placement contract. All coordinates below are logical pixels before global scaling.

Use `s = min(viewportWidth / 1920, viewportHeight / 1080)`, matching V3. Scale the complete map group together. Its top-left is `(viewportWidth/2 − 696*s, viewportHeight/2 − 410*s)`; this produces `(264,130)` at 1920×1080 and centers it appropriately on ultrawide displays. Keep the frame’s proportions. These fixed exports use zero nine-slice insets and zero image outsets; shadows are CSS.

| Element | Rect / placement | Instructions |
|---|---|---|
| Frame body | 1336×800 | Display the 2672×1600 PNG at half size before global scaling. |
| Pixel map aperture | x64, y46, 1224×700 | Clip to radius14; the frame PNG has a matching transparent opening. |
| Title plaque | x388, y−44, 560×76 | Separate art, live WORLD MAP text. Spectral600, 30px. |
| Close | x1264, y6, 44×44 | Live ×; normal, hover, pressed, focus art. |
| Bookmarks | x1316, y170 | Five 168×82 controls, vertical gap12. First20px tuck beneath the frame. |
| Bookmark glyph | x27, y20, 42×42 within button | Separate image; preserve aspect ratio. |
| Bookmark label | x68, y24, 88×32 within button | Spectral400, 19px; live/localizable. |
| Compass/scale paper reservation | x1042, y485, 166×198 within aperture | Opaque paper and input interception; compass centers on player. |
| Footer paper reservation | x0, y658, 1224×42 within aperture | Covers underlying terrain; help at x20,y666. Intercept clicks. |

Render bookmarks behind the frame, map inside the aperture, frame above it, then title and close. Follow the supplied CSS to avoid edge seams. The compass and footer are permanent paper UI reservations, including on a fully explored map. They are not additional unexplored world cells.

The context preview shrinks the existing V3 minimap group to 90% only while this map is open (283.5×270 logical pixels). This leaves its bottom at y288 and the first bookmark at y300 at 1080p. Keep the top/right HUD anchors. Restore normal minimap scale on close. This is a deliberate placement change for the coding agent, not a new minimap skin. Other V3 HUD groups stay at their existing scale and anchors.

## Controls and changes to the existing UI

| Existing concern | New treatment |
|---|---|
| Row of map controls below the map | Use five right-edge bookmarks, ordered Places / Roads / Terrain / Waters / Markers. |
| Layer checkbox behavior | Preserve independent booleans with `aria-pressed`; several can be enabled together. Do not turn these into exclusive tabs. |
| Extra debug/seed controls | Keep available through existing developer tooling; omit them from the production folio. |
| Existing map camera and exploration | Retain authoritative game state and adapt it to this aperture; do not create a second independent camera in the game. |
| Map content appearance | Retain pixel rendering, nearest-neighbor sampling and original geography proportions. |
| Unexplored fog | Replace black/translucent fog with opaque warm paper, using the game’s exploration mask. |
| Close and keybindings | Route the close button and existing map command through the game’s UI manager. M/Escape are the reference demo bindings; existing user bindings remain authoritative. |

Map each bookmark to the relevant actual game layer. The screenshot is insufficient to infer engine API names; none are invented here. If a category cannot be separately rendered, disable its control until supported or adjust the renderer. Enabling/disabling a button must change the relevant runtime layer, not just its appearance.

Normal/hover/pressed/on/focus/disabled PNGs are provided per bookmark. Persistent on-state uses brighter cloth/brass; transient hover, pressed and keyboard focus follow the supplied CSS. Disabled controls must use the actual disabled property and ignore input. The reference CSS adds a clear focus outline. All text and glyphs are separate from the skin.

## Fog and rendering contract

Use the game’s real exploration grid. The sample `demo/explored-sample.png` and `demo/exploration-data.js` are illustrative and must not become production world geometry. In the reference API, the grid is row-major, 0 unknown and nonzero explored, spanning the same world-space `bounds` as the terrain. It is copied to a binary mask and sampled with smoothing disabled.

1. Paint the full aperture with opaque `fog-parchment-tile.png`, repeated at 512×512 logical pixels. Keep this physical paper anchored to the folio page. It should not drift when the world camera moves. Optional folds belong to the paper.
2. Render terrain and every enabled road/place/water/marker layer into an offscreen map buffer using the same world camera and bounds.
3. Render the player/world overlays into that same buffer, then apply the authoritative exploration mask using `destination-in` or an equivalent opaque mask pass. Terrain, text, icons and markers must all be concealed outside explored cells.
4. Composite the masked map over the paper. Do not apply fog opacity to the whole UI or leave unrevealed map colors visible beneath translucent paper. Outside the world bounds remains paper.
5. Draw frame and live UI above it. Do not place gameplay markers in DOM overlays above the mask unless they are explicitly exploration-filtered.

Keep terrain, overlays and the mask world-anchored during pan/zoom; keep only the paper page-anchored. Maintain the pixel edge of the exploration frontier. Do not paint new illustrative terrain over the pixel map. Tests confirmed unknown pixels equal opaque paper, including when a vivid test content layer is present.

## Reference API and integration

The included `WandererWorldMap` class owns a logical 1224×700 viewport, coordinate conversion, pan/zoom, mask composition and map controls. It is suitable as a starting point for a canvas game UI or as a behavior reference for another engine. It does not depend on a framework or network fetch.

Include `css/world-map.css` and `js/world-map.js`. The following names are adapter inputs supplied by the coding agent, not existing game APIs:

```js
// Adapter inputs: worldBounds, fullWorldRaster, explorationGrid,
// playerWorldPosition, worldUnitsPerMeter and persistLayerChoice.
const view = new WandererWorldMap({
  parent: document.body,
  assetBase: './ui/map/',
  bounds: worldBounds, // {x, y, width, height} in authoritative game units
  source: fullWorldRaster, // CanvasImageSource representing those entire bounds
  player: playerWorldPosition,
  worldUnitsPerMeter,
  layerState: {places: true, roads: false, terrain: false,
               waters: false, markers: false},
  layers: [
    // Optional sources must cover the same full bounds.
    // Or provide draw(ctx, {bounds, camera}) in world coordinates.
    {id: 'roads', draw: drawRoadsInWorldCoordinates},
    {id: 'places', draw: drawPlacesInWorldCoordinates}
  ],
  onLayerChange: (id, enabled) => persistLayerChoice(id, enabled),
  onMapClick: worldPoint => handleExploredMapClick(worldPoint),
  onClose: () => releaseGameUIInputOwnership()
});
view.setExplored(explorationGrid); // {columns, rows, data: Uint8Array}
await view.ready;
view.setCamera({x: playerWorldPosition.x, y: playerWorldPosition.y,
                zoom: logicalPixelsPerWorldUnit});
view.open({focus: true});
```

`layers[].draw` and `drawWorldOverlay` callbacks receive a context already transformed to world coordinates and clipped to world bounds. Preserve context state; the reference wraps callbacks in save/restore. If terrain is procedural, omit `source` and draw it through `drawWorldOverlay`, or adapt the renderer’s draw pass. Respect the enabled category booleans for optional layers.

Do not stretch an already zoomed viewport screenshot/canvas across full-world bounds. If the game already renders a viewport, adapt its render pass and mask to the existing camera, or provide a full-world raster. One authoritative transform must drive terrain, mask and overlays. `source` and `layers[].source` fill their declared bounds; preserve the correct world aspect ratio and coordinate mapping.

Methods include `setSource(source,bounds)`, `setExplored(grid)`, `setLayers(layers)`, `setLayer(id,boolean,{notify:false})`, `setCamera({x,y,zoom})`, `zoomBy(factor,logicalPoint)`, `locatePlayer()`, `invalidate()`, `open({focus:true})`, `close()` and `destroy()`. Set `view.player` when the player moves and invalidate when rendered content changes. Call `setExplored` when exploration changes; data is copied. If world bounds change, supply the corresponding exploration grid and camera too. `destroy()` aborts listeners, cancels queued drawing and removes DOM.

The class emits `worldmap:layer-change` and `worldmap:close` on its root element. Use callback or event consistently to avoid handling the same change twice. `setLayer(...,{notify:false})` synchronizes external state without feedback loops. Layer sources remain independently optional.

The scale bar computes a live nice interval from zoom. Supply the real positive `worldUnitsPerMeter`; otherwise it labels generic units. The demo value 0.1 is illustrative. Do not copy its 600m reading or the mockup’s 3km as a fixed label. The compass assumes north-up; update its design/rotation if the game allows rotation.

The reference canvas converts pointer coordinates using its scaled DOM bounds, supports left-button capture/drag, wheel zoom around the pointer and keyboard arrows/+ /−. Map click callbacks are blocked for unexplored cells. Use one input owner: either this reference implementation or the existing map controller. Do not attach two competing pan/zoom handlers. The game UI manager must block underlying world actions and coordinate other windows while the map is open. The reference dialog is nonmodal and does not trap focus; adopt the game’s existing modal/input conventions. Opening with focus saves the previous element; closing restores it. The demo binds global M/Escape only as an example.

## Art fidelity and boundaries

The frame, title, neutral bookmark, parchment and close materials were generated from approved reference crops, then technically assembled into aligned exports. Cloth colors and interaction states derive from one matched bookmark material to avoid inconsistent shapes. `PROMPTS.json` records generation prompts. The five glyphs are cleaned reference cutouts, resampled to 84×84 from roughly 40–55px originals: preserve the supplied 42px nominal display size. They are not fresh high-resolution icon paintings. The compass has an editable precise SVG source and a PNG export.

The frame is fixed-size, rather than runtime nine-sliced, to retain the brass corners, stitching and left spine proportions. All production PNGs are sRGB RGBA with straight alpha, 2× nominal display dimensions; the paper tile is fully opaque. Live title, labels, cardinal letters, hints, scale and × prevent baked-text localization problems. Longer translations need measured label adjustments; no localization claim is made beyond separate text layers.

The preview uses the actual supplied pixel map crop with uniform zoom 1.4, not repainted terrain. Its baked labels/roads/player arrow scale with the image and cannot be individually toggled. The real game should render those as its existing live layers; it may keep live labels a fixed screen size. The preview’s fog shape is illustrative. These are the main differences from the approved mockup’s particular geography/label composition.

## Acceptance checks in the game

- Compare at 1080p with `world-map-preview-1920x1080.png`: frame proportions, title rise, tucked bookmarks, footer, compass and HUD clearance.
- Use fully unknown, partially explored and fully known actual saves. Unknown terrain, text and markers must never show through; UI paper reservations remain opaque.
- Pan/zoom across exploration edges; verify map and mask stay registered and geography is not stretched. Verify scale values against real game distances.
- Toggle several categories together and verify actual layer changes. Test a disabled category, keyboard focus, close and existing map keybinding.
- Confirm click targets under legend/footer and unknown map cells cannot trigger hidden locations. Confirm world controls do not receive map gestures.
- Check the target desktop resolutions and actual game renderer performance with representative world data. Browser reference checks are recorded separately; actual engine integration/performance remain the coding agent’s responsibility.
