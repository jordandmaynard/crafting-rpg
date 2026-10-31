# Emberwild — Wanderer’s Kit desktop integration, revision 3

Use this revision as the visual/layout target for the inventory, refining window, and bottom desktop HUD. The user has explicitly authorized changing window, slot, button, scale, and placement requirements to match the approved Wanderer’s Kit mockup. The size formulas in the original `ui-reskin-spec.md` are therefore superseded for the components below. **Latest instruction: use four refining output slots in a 2×2 grid. This supersedes the earlier eight-output requirement.** Touch controls remain out of scope.

The original brief describes the current implementation; this handoff describes the intended replacement. Existing gameplay state, item identities, station conversion logic, inventory capacity, equipment rules, commands, and bindings remain authoritative. No game repository was supplied here, so the delivered CSS/HTML are a reference assembly rather than changes already applied to the game.

## Read these files

1. `preview.html` and `desktop-v3-preview-1920x1080.png`: assembled target built from the supplied files and live text.
2. `layout.json`: exact group anchors, component rectangles, grid geometry, and overlay coordinates in **logical 1920×1080 CSS pixels**.
3. `manifest.json` and `ASSET_SPEC.md`: PNG dimensions, rendering method, source-pixel slice insets, state families, and hashes.
4. `wanderers-kit.css`: concrete layout, layering, size, and state examples.
5. `hud-proof.html`: hotbar, abilities, and mode buttons at native reference sizes.

The HTML selectors are reference selectors. Map them onto the actual game components/selectors after inspecting the repository.

## Required changes from the current game and V1 assembly

All dimensions below are before the uniform screen-fit scale.

| Component | Original implementation/brief | Earlier V1 assembly | V3 target |
|---|---|---|---|
| Inventory organization | One window; gear and pack columns | Two detached windows | One movable inventory group; parchment folio left, physical backpack right, joined spine |
| Backpack grid | 5 columns × 4 rows; 20 items | 4 × 5 | **4 columns × 5 rows; 20 items** |
| Backpack cell | About 55px | 55px | **90px**, 8px gaps |
| Gear cell | About 55px | 55px | **84px**, six named positions around the character |
| Refining cells | Same small generic cell | 55px | **110px**, 8px gaps; dedicated raised-brass cell skin |
| Station layout | A row under inventory | Separate 690×410 window | Separate **720×500** physical station window |
| Refining capacity | 2×2 inputs / 4×2 outputs | 2×2 / 4×2 | **2×2 / 2×2; four outputs** |
| Character shell | Gear column | 304×545 generic parchment window | **450×664** dedicated folio |
| Backpack shell | Pack column | 302×545 generic window | **506×732** dedicated leather backpack, including bedroll |
| Inventory footprint | Depends on existing window | About 620px overall width | **924px**, about 48% of a 1920px screen |
| Weapon hotbar | About 51px slots | 51px | **92px** slots, 6px gaps; broad leather/copper frame |
| Ability buttons | About 53px; icon about 39px | 53px | **92px** buttons; 76px full-frame icon inside a slimmer frame overlay |
| Pack / Build / Map | Desktop grouping differs; shared action-slot skin | 86×53 side-by-side glyph/label | **110×94**, dedicated near-square frame, **glyph above label** |
| HUD key tabs | Existing key legend position varies | Small tabs under buttons | **28×26 minimum**, centered 3px under abilities/modes |
| Bottom anchoring | Existing layout | Smaller widely spaced controls | Hotbar left, modes centered, abilities right; coordinates below |
| Selection art | CSS tint/flat outline | Flat bright outline on the rim | Delivered material-lighting states preserving bevel/texture |

Remove the old 4.7vh, 4.9vh, and 5.12vh sizing rules for these revised components; applying them on top of the new group scale would double-scale or shrink the UI. Build-bar item tiles, crafting rows, storage grids, dialogs, toasts, target meters, and XP meters are separate follow-on components, not implicitly resized to the new hotbar size.

## One scale calculation

Use logical reference sizes inside each group and scale each group once:

```js
const s = Math.min(viewportWidth / 1920, viewportHeight / 1080);
```

Use the actual game viewport dimensions when embedded inside a page. At 1920×1080, `s=1`; at 1280×720, `s=2/3`; at 2560×1440, `s=4/3`; at 3840×2160, `s=2`. Keep the physical panels and all their live overlays at the same scale. Scale their border geometry, font sizes, and gaps once as part of the group.

Anchor edge groups to the **actual viewport**, not to a centered 1920-wide stage. On an ultrawide screen, the hotbar stays at the left edge, abilities/minimap/station stay at the right edge, and mode buttons stay centered. This leaves more world space in the middle. Do not add letterboxed UI margins on ultrawide.

For a left/top anchored group, multiply its logical offsets by `s`, then apply `transform: scale(s)` with `transform-origin: top left`. Right-anchored groups use `top right`; bottom groups use the corresponding bottom origin. The mode group uses `left:50%; transform:translateX(-50%) scale(s)` with `bottom center` origin. The delivered CSS demonstrates these exact combinations.

The proof covers desktop viewports from 1280×720 upward. A compact layout below that size and touch controls are not defined by this pass. Large accessibility zoom beyond the screen-fit size needs a separate compact/scrolling layout; do not silently clamp the enlarged windows off screen.

## Inventory construction and coordinates

Place the group at logical **left 16, top 140**, size **924×732**. Inside it:

- Folio: `[0,68,450,664]`.
- Backpack: `[418,0,506,732]`, above the folio in z order.
- Their **32px horizontal overlap** hides the duplicate spine and joins the physical covers. No extra CSS border or inserted title strip is required.

`inventory-character.png` and `inventory-backpack.png` are **fixed-proportion skins**. Render each as a single absolutely positioned image. Do not 9-slice the bedroll, stretch straps independently, or place the backpack over a generic parchment panel. The backpack’s entire grid field is dark leather.

Use the corresponding live overlay rectangles from `layout.json` for titles, capacity, close controls, and cells. The pack grid begins at backpack-local `[84,200]`; use four columns and five rows, 90px cells, and 8px gaps. Map item index `i` as `column=i%4`, `row=Math.floor(i/4)`. Changing the column count is presentation only; preserve all 20 existing entries and saved item identities.

Paper-doll equipment positions, local to the folio, are:

| Existing slot identity | Position x,y | Size | Visible label |
|---|---|---|---|
| head | 173,118 | 84×84 | Helmet |
| chest | 52,218 | 84×84 | Torso |
| weapon | 52,371 | 84×84 | Weapon |
| amulet | 310,218 | 84×84 | Amulet |
| legs | 310,371 | 84×84 | Pants |
| boots | 173,516 | 84×84 | Boots |

There is one amulet slot. Place the live character renderer in folio-local `[132,224,200,292]`. Fit the model and camera to this region while retaining its real equipment and proportions. `demo/character-preview.png` is a visual stand-in only, not a replacement for the actual character renderer. Keep slot controls and labels above/around the character without intercepting one another.

Dragging either inventory title area moves the whole joined group. Exclude close buttons from the drag handle. Closing either inventory close control invokes the game’s inventory-close behavior. Keep the decorative images `pointer-events:none`. Real item cells, counts, tooltips, drag targets, and close buttons remain live HTML. Convert pointer drag deltas to logical units by dividing by `s`, or use the actual transformed rectangles consistently.

Existing refine/stash/trash commands must remain reachable. This pass prioritizes the mockup’s clean pack face; retain those commands through an accessible contextual action menu or a compact accessory strip outside the 20-cell grid until dedicated skins are delivered. Preserve their original enable/disable and destruction-confirmation behavior.

## Separate refining window — four outputs

Anchor the station **right 20, top 340**, size **720×500**. `station-window.png` is one fixed-proportion casing with an integrated header. Its width was reduced from the 790px V2 design by re-cutting the blank center, preserving its ends and header mount. Place `station-grinder-crest.png` above the upper-left mount.

Use the new `cell-refine*.png` family for both input and output. These are **110px** cells with a raised worn brass rim, four small corner rivets, and a recessed dark leather well. Inventory/backpack cells keep their separate thinner frame and their V2 sizes. Do not globally restyle every `.cell` as a refining cell.

| Layer | Local rectangle / layout |
|---|---|
| Grinder crest | `[48,-4,160,142]` |
| Live title | `[248,48,340,52]` |
| Close | `[662,46,30,30]` |
| Inputs | Origin `[32,174]`, 2 columns × 2 rows, **110px** cells, 8px gaps |
| Machine illustration | `[272,200,150,158]` |
| Right arrow | `[410,255,48,40]` |
| Outputs | Origin `[460,174]`, **2 columns × 2 rows**, **110px** cells, 8px gaps |
| Progress label | `[274,360,172,28]` |
| Progress meter | `[277,392,166,22]` |
| Accepted-material footer | `[34,426,652,30]` |

Bind output indices **0–3** to the four visible cells in stable row-major order. Empty cells stay visible. The accepted-material list, illustrated count of four flour, and 62% progress are sample data; bind actual station values. Preserve conversion, transfer, tooltips, and persistence rules except for the authorized output-capacity change.

### Existing saved stations with eight outputs

Never implement this change by slicing a saved eight-element output array and dropping indices 4–7. Use four active output slots for new production. During save migration, preserve any legacy entries beyond index 3 in an ordered overflow/claim queue. Move that queue into empty visible cells before accepting new production into the output grid; pause production while legacy overflow remains if needed. Persist the queue until it is drained. Picking up visible results must expose all previously saved output items without adding a second visible output row. This is a migration safeguard, not eight slots of capacity for new production. Test an old save with occupied entries at every legacy index.

The same four-input/four-output geometry may be shared by the saw table, grinder, smelter, and tanning rack. This pack still provides only the grinder-specific header crest; retain the other stations’ existing illustrations until their dedicated physical treatments are supplied.

## Desktop HUD

| Group | Anchor | Reference dimensions |
|---|---|---|
| Hotbar | Left 18, bottom 44 | Seven 92px slots, 6px gaps; number inside upper left |
| Modes | Horizontal center, bottom 20 | Three 110×94 buttons, 10px gaps; key tabs below |
| Abilities | Right 18, bottom 20 | Four 92px buttons, 12px gaps; key tabs below |

Use distinct assets:

- `slot-hot*.png`: broad leather/copper hotbar frame. Item icon inset 9px; numbers at `[10,5]`.
- `slot-ability*.png`: slim frame with a transparent center, composited **above** the full-frame ability icon. Icon rectangle is `[8,8,76,76]`. The slight overlap under the rim hides seams. Preserve blue / gold / red ability-slot colors and blue Dash.
- `button-mode*.png`: near-square physical mode button. Glyph 42×42 at `[34,10]`; live label begins at y=60, centered, 20px Spectral 600. Use the cream `icon-mode-pack/build/map.png` cutouts to match the approved mockup.
- `keycap.png`: live text in a separate tab centered under the mode/ability button with a 3px gap, 28×26 minimum. Grow it for longer bindings.

Do not substitute a short text button or generic action slot for the three mode controls. Keep their glyphs above their labels. Use Pack / Build / Map command behavior already defined by the game. For combat, obtain key legends from the actual binding configuration; **Q/E/R/F in the proof follow the mockup, not an instruction to rebind gameplay**. Existing commands and remapping win.

Use delivered `hover`, `pressed`, `selected`, `focus`, `locked`/`disabled`, `drop`, and `poor` variants where provided. Their dimensions and alpha footprints match the normal state. Selection brightens the existing material rather than adding a large flat outline. Cooldowns and disabled icon dimming remain live overlays. Keep keyboard focus visible independently of selected state.

## Minimap frame and north medallion

The minimap now has its own production frame, `frame-minimap.png`, at **315×300 CSS px**, anchored **right 20, top 18**. The image includes the leather casing, brass corners, divider, and parchment place/time footer. The rounded map opening is actually transparent.

- Map viewport: `[18,21,279,186]`, clip radius 7px. In the 630×600 source PNG, the opening is `[36,42,558,372]`.
- Place label: `[31,225,250,29]`, 24px Spectral, left aligned.
- Time label: `[31,257,250,22]`, 18px Spectral, left aligned.
- Compass: `[238,17,64,64]`; use the dedicated `compass*.png` medallion, not a CSS border circle.

Layer order is live pixel-map canvas, frame image, live footer labels, then compass. Render the map for the true world-coordinate viewport; crop/clip it without stretching geography. The outer frame remains the fixed 315×300 design before group scaling. Preserve the game-generated pixel look. The full world map also stays pixel rendered, with parchment only for unexplored fog/background.

Keep the N live and upright. The needle is a separate SVG/DOM layer, centered in the medallion and rotated from the game’s existing north/camera state. `--north-angle` is the preview CSS hook. Bind the button’s normal/hover/on visuals to the actual north-lock behavior; the offline example only demonstrates the toggle state. Do not rotate the entire medallion or N when only the needle needs to move.

## Level and hero-health frame

The status group is **358×88**, anchored **left 18, top 28**. It now uses dedicated PNGs rather than the generic window skin or CSS rings:

| Part | Group-local rectangle |
|---|---|
| `frame-health.png` plate | `[48,9,310,76]` |
| `ring-level.png` medallion | `[0,4,80,80]`, above the plate in z order |

Inside the plate, live HEALTH/current/max text goes in `[35,12,259,29]` (20px Spectral 600). The red fill goes in `[29,45,262,14]`, clipped to the painted recessed channel; radius 2px. Use `bar-health-fill.png` as the red fill texture. Compute the displayed fraction as `maxHealth > 0 ? clamp(currentHealth/maxHealth,0,1) : 0` and clip the fill width to that fraction. Do not scale the entire plate or change the track’s width when health changes. A lag/damage layer can remain a live effect beneath the current fill.

The level number remains live in the center of the 80px disk, 36px Spectral 600. The disk overlaps the left side of the health plate and draws above it. It is a fixed painterly image, not a CSS circle outline. Existing level values and health behavior remain unchanged.

Dedicated art for the close controls and station-progress meter is still pending; the preview retains their prior CSS treatments. Fonts, inventory, and bottom HUD remain as approved in V2.

## Asset handling

PNG skins use sRGB, straight RGBA, smooth UI alpha. The item/building icon binary-alpha rule does not apply to these frames. The full-window and button primitives retained from V1 have 9-slice metadata; the physical inventory shells, station shell, minimap casing, health plate, level/compass medallions, mode controls, ability overlay, crests, and glyphs use fixed aspect ratios. Check `manifest.json` before choosing a rendering method.

All slice arrays in the manifest are source-pixel **left,top,right,bottom** order. CSS shorthand requires **top,right,bottom,left**. Divide source values by two for nominal 1080p CSS borders. Fixed assets have zero slices and are scaled as whole images with their parent group. Image outsets are zero; shadows are CSS effects.

The cream mode glyphs are exact technical cutouts from the approved reference, exported at 84×84 for 42px display; their native reference detail is about 40px. They prioritize matching the mockup. If native 256px masters are made later, preserve these simple cream silhouettes rather than replacing them with busy colored item illustrations.

## Completion checks in the actual game

1. At 1080p, the joined inventory occupies about 48% screen width and leaves the bottom HUD clear. Its grid is 4×5 with all 20 saved entries present.
2. Equipment uses exactly six identity-correct controls and the live character renderer; only one amulet exists.
3. Refining has four inputs and **four working outputs**; migrating an old eight-output save preserves every existing item through the legacy queue.
4. The two physical inventory shells retain their proportions and remain joined while dragging; decoration never catches item drops.
5. The hotbar, abilities, and modes have distinct frames; mode glyphs sit above labels; mode/ability key tabs sit below.
6. Current bindings, selection, hover, focus, cooldowns, tooltips, close actions, inventory utility commands, and item dragging still work.
7. Test the dedicated HUD frames, live health values at 0/50/100%, and compass pointer at multiple headings. Test 1280×720, 1920×1080, 2560×1440, 3840×2160, and ultrawide. The offline proof checked layout at the first three and 3440×1440; actual-game 4K/live-renderer validation remains necessary.

Keep developer panels unskinned. Touch controls and the rest of the original full asset brief remain separate follow-on work. Do not apply unrelated gameplay changes as part of this skin integration.
