# Wanderer’s Kit — Crafting production v1

Three bespoke crafting windows: weaponsmith, armorer and alchemy. Each has a distinct border, with one shared parchment interior, recipe list, selected-item preview, materials area and Craft action.

Quantity controls are removed. Each discrete Craft activation requests one recipe execution (`count: 1`). The recovered space supports four visible material rows, with scrolling for longer recipes. The Craft button stays fixed below them.

## Open and review

- Open `preview.html` in a modern desktop browser. The external preview controls switch station skins and reset illustrative inventory data. Select a recipe, inspect owned/needed materials, then Craft.
- `crafting-weapon-preview.png`, `crafting-armor-preview.png` and `crafting-alchemy-preview.png` are actual assemblies made from the delivered files and live HTML, not additional generated mockups.
- `crafting-set-overview.png` compares the three current assemblies. `crafting-asset-proof.png` shows the production skins and states.
- Give the coding agent `CRAFTING_CODING_HANDOFF.md`, `ASSET_SPEC.md`, `layout.json`, `manifest.json`, `ui/crafting/`, `css/crafting.css`, `js/crafting.js` and the font files/licenses.

## Contents

25 text-free PNG assets: three frame backgrounds; eight recipe-card states; six Craft-button states; four close-button states; materials panel; item-preview frame; horizontal and vertical dividers. PNGs are straight RGBA, sRGB, 2× nominal logical size. Titles, names, counts, hints and button labels stay live.

This is a standalone add-on to Desktop V3. It leaves the previous inventory, world map, HUD and four-output refining window packages intact. Crafting recipe selection is distinct from the refining input/output-grid workflow.

## Integration boundary

No game repository was supplied or modified. `js/crafting.js` is the working shared UI reference. It includes selection, scrolling, availability checks, single-action requests, pending guards, keyboard focus, close/reopen and callback error recovery. The game adapter must supply real station/recipe IDs, item icons, inventory counts and authoritative crafting transactions.

`demo/` uses illustrative recipes and costs, existing painted icons and cutouts from the approved mockups. Those cutouts are preview content, not new production item icons. The original images in `reference/` show the old quantity UI; the current production previews and handoff supersede that part.

`PROMPTS.json` records the built-in image-generation prompts used for the blank frame and component artwork. The delivery includes technical crop/resampling and color-state derivations. `manifest.json` contains final PNG dimensions, insets, states and hashes.

## Verification

`browser-validation.json` records 15 successful layout combinations: all three skins at 1280×720, 1920×1080, 2560×1440, 3840×2160 and 3440×1440. It also records single-item execution, pending protection, shortages, activation-time rechecks, external availability gates, merged duplicate ingredient costs, scrolling, keyboard selection, callback failure recovery, close/reopen and teardown. `asset-validation.json` records file checks.

The included checks validate the standalone reference UI. Actual game integration and performance remain to be checked in the game.
