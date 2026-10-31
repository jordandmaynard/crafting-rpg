# Emberwild UI re-skin: asset brief

This brief goes with the mockup `mockup-wanderers-kit.png` ("Wanderer's Kit at Honeymead"): leather, brass and parchment, painterly, warm.

It describes how the game's UI is built today and lists every asset needed to re-skin it in that style. It also covers how each asset must be cut (9-slice, 3-slice or fixed), the sizes it is shown at, and the states it needs. The asset maker delivers PNGs to this spec, and Claude then wires them into the game's CSS.

---

## 1. How the UI works today

- **It's plain HTML and CSS drawn over the 3D canvas.** There are no image frames yet. Every panel, slot and button is a CSS box: a flat fill (`--panel #282430`), a 3px border (`--panel-edge #4e425f`) and a hard black drop shadow 3 to 4px down and right. The only images are the icons.
- **The re-skin replaces those boxes with images.** Frames use CSS `border-image` (9-slice) and bars use 3-slice. Each state (hover, selected and so on) is its own PNG. Text stays live HTML text, so the art must not include any words except where noted.
- **Everything scales with the screen height.** Slots are a share of the viewport height (`vh`, copied from V Rising's proportions) with a pixel minimum. The same asset is therefore shown anywhere from about 40px to over 200px wide. 9-slice frames keep their borders at a fixed width while the middle stretches, so this works as long as the art is cut as described below.
- **Reference screen:** sizes below are given at **1920×1080**, with the scaling formula alongside. At 1440p multiply by 1.33, and at 4K by 2.
- **Icons are already painted**: 256px painterly masters, shipped as WebP at 64, 128 and 256. Every item icon gets a 1px black outline at run time, so masters need no baked stroke. Icons aren't part of this brief except for the few UI glyphs listed in section 6.

### Screens and windows that exist

| Screen | What's on it | Mockup equivalent |
|---|---|---|
| Play HUD | health plate with level ring (top left); minimap, place and time plate, time-of-day strip, small buttons (top right); hotbar 1-7 (bottom left); action bar: weapon abilities, dash, and on touch Pack/Build/Map (bottom right); XP bar across the very bottom; target bar (top centre); toasts; prompts | whole picture |
| Build mode | build bar centred at the bottom with double-size squares and names; a second row opens above it for a category; BUILD MODE tag | not shown: same slot art, larger |
| Inventory | title bar with X; GEAR column (paper doll 3×4 grid); PACK column (5 wide, 20 squares); refine, stash and trash buttons; item info line | "Character" + "Backpack" |
| Inventory + storage | a third column with a crate (10) or chest (20) grid | Backpack-style grid |
| Inventory + station | a row under the pack: input grid 2×2, progress bar, output grid 4×2 | "Grinder" window |
| Crafting window | title, list of recipe rows (72px item cell, name, about, cost, CRAFT button), footer with DONE | not shown |
| Map window | title bar with X, 640px map canvas, rows of toggle buttons, seed input | not shown |
| Start, Options, Death sheets | modal sheet: big title, sub line, bullet list or options (checkboxes, sliders), loading bar, one big primary button | not shown |
| Dev panels (Tune T, Profiler G, error box) | developer tools | **leave unskinned** |

### Layout changes the mockup implies

These are code changes I'll make when wiring the assets in. The asset maker doesn't need to do anything for them, but the parts they need are in the list below.

1. The inventory splits into two windows side by side: **Character** (paper doll) and **Backpack** (pack grid, 4 wide in the mockup, 5 today).
2. A station opens as its **own window** (header icon plate, "Raw Materials" grid, machine picture with arrow and progress, "Refined Goods" grid, footer line listing what it takes), not as a row under the pack.
3. Pack / Build / Map buttons sit **bottom centre** on desktop too, with key caps **under** the slots (as tabs), not inside the corner.
4. The minimap and place plate share one frame, with a round N compass medallion.

---

## 2. Delivery format (applies to every asset)

- **PNG, RGBA, straight alpha**, sRGB. Anti-aliased edges are fine because the style is painterly.
- **Scale:** draw every frame at **2× its 1080p CSS size** (for example, a frame with a 12px border on screen is drawn with a 24px border). It is shown at 1× to 4× of that, and the smooth scaling holds up.
- **9-slice:** for each frame give the **slice insets** (left, top, right, bottom, in source pixels): the corners that never stretch. Also give the **content inset**: where text and slots can start inside the frame, if that differs from the slice. Edges and centre must **stretch or tile cleanly**. Say which (`stretch` or `repeat`) per asset. Leather and parchment usually want `repeat` for the edge stitching and `stretch` for the centre.
- **Shadows and glows outside the frame** (the dark drop shadow under each panel in the mockup): either bake them into the PNG and state the **outset** (how far the art extends beyond the box on each side), or leave them out and I'll draw them in CSS. Baked shadows look better in this style, so state the outset.
- **States are separate files** with **identical size and slice insets** (so a hover frame lines up exactly with the normal one).
- **No text baked in**, except the N on the compass and the digits on key caps if they're decorative (live text is preferred).
- **Naming:** `ui/{group}-{name}[-{state}].png`, all lower case, for example `ui/slot-bar-hover.png`.
- **Also deliver:** a JSON or Markdown table listing every file with its size, slice insets, content inset, outset and repeat mode. I'll read the CSS numbers straight from it.

---

## 3. Frames (9-slice)

| File | Used for | Shown size at 1080p (CSS px) | States | Notes |
|---|---|---|---|---|
| `ui/panel-window.png` | Inventory windows (Character, Backpack), crafting, station, map, storage | any size, 300 to 900 wide | one | The mockup's leather book frame with brass corners and parchment inside. Corners about 28px at 1×. The parchment centre must stretch or tile with no visible seam over about 600px. |
| `ui/panel-window-inset.png` | the darker leather well behind the pack grid (mockup Backpack interior) | any | one | Optional second skin for grid areas. Without it, the grid sits on parchment. |
| `ui/panel-plate.png` | small HUD plates: health plate, place and time plate, FPS tag, BUILD MODE tag | 200×60, 246×70 | one | Thinner leather strip with brass corners (mockup health plate). |
| `ui/panel-toast.png` (+ `-good`, `-calm`) | toast messages, centred near the top | up to 640 wide, 1 to 3 lines | alert (red edge), good (gold), calm (teal) | Same frame; the 3 versions differ only in a coloured inner edge or gem. |
| `ui/panel-sheet.png` | modal sheets: Start, Options, You Have Fallen | 520 wide, up to full height | one | Can reuse `panel-window`; the sheet just has larger padding. |
| `ui/titlebar.png` | the title strip at the top of a window (mockup "Backpack 5 / 20" bar) | full window width × about 44 | one | 3-slice horizontal (left cap, repeating middle, right cap). The window is dragged by it. |
| `ui/titlebar-iconplate.png` | the raised plate that holds a station's picture at the left of its title (mockup Grinder header) | about 110×80 | one | Fixed size; the station's painted icon goes on top. |
| `ui/divider-h.png` / `ui/divider-v.png` | rules between sections (between gear and pack, above a station row, under a title) | width or height of the section × 6 | one | 3-slice, with stitched leather or a parchment flourish. The mockup's corner flourishes are `ui/flourish-corner.png` (fixed, mirrored in code). |
| `ui/frame-minimap.png` | frame around the minimap and place plate together (mockup top right) | 250×330 outer; map window 240×240 | one | A 9-slice that holds a 240 square map hole on top and a parchment strip under it. Give the map hole's inset exactly. The map canvas is square. |
| `ui/frame-daystrip.png` | the time-of-day strip under the minimap | 240×34 | one | Thin frame; the strip is a canvas drawn inside. |

---

## 4. Slots and cells (9-slice, square)

Every slot is a 9-slice frame drawn **square**. The icon sits in the middle with the padding noted. One set of art works for every size because the border stays fixed and only the dark well in the middle stretches.

| File | Used for | Size at 1080p | Formula | States |
|---|---|---|---|---|
| `ui/slot-bar.png` | action bar: weapon attack, Q, E, dash, Pack/Build/Map | 53px (icon 39) | `max(40px, 4.9vh)`, gap 1.35vh; phones 46px | normal, `-hover`, `-selected` (gold rim, the picked build piece), `-pressed`, `-locked` (dimmed) |
| (same art) | build bar in build mode | 106px (icon 92) + a name line under it | `min(max(80px, 9.8vh), (100vw-40px)/10.6)` | same + `-poor` (can't afford; today a red tint on the icon, so a red rim is optional) |
| `ui/slot-hot.png` | hotbar 1-7 (weapons) | 51px | `max(38px, 4.7vh)`, gap 0.6vh; phones 42px | normal, `-hover`, `-selected` (gold, the weapon in hand: mockup slot 1), `-drop` (drag target), `-pressed` |
| `ui/cell.png` | pack, gear doll, crate, chest, station input and output squares | 49px inside + border ⇒ about 55px box | inside `max(34px, 5.12vh - 6px)`; pack gap 0.51vh; doll gap 1.2vh; phones 48px | normal, `-hover`, `-focus` (gold: controller cursor or drag target), `-pressed`, `-held` (item lifted out: the icon goes 30% in code, so no art needed) |
| `ui/cell-gear.png` | paper doll squares if they should differ (mockup: square slots with the label under them) | as `cell` | | as `cell` |
| `ui/cell-recipe.png` | item square in a crafting recipe row | 72px (phones 48) | fixed | normal |
| `ui/row-recipe.png` | a whole recipe row (focus highlight) | window width × 82 | 3-slice horizontal | normal (transparent), `-focus` (gold), `-poor` (can't afford, dim) |
| `ui/keycap.png` | the key tab under a slot (mockup's I, B, M, Q, E, R, F tabs) | about 22×22, under or overlapping the slot's bottom edge | 9-slice so wider labels (TAB, RMB, SPACE) fit | normal |

**Slot extras:**
- **Stack count** (mockup "28"): live text at the bottom right. Leave room in the art.
- **Slot number** (hotbar 1-7, top left, mockup style): live text.
- **Cooldown:** a dark fill rising from the bottom over the icon with a number in the middle. Done in CSS; an optional `ui/slot-cooldown.png` overlay (a tileable dark tint) is welcome.
- **Group marker:** a small triangle in a build-bar slot's top-right corner meaning "opens a row" (`ui/mark-group.png`, about 8×6).

---

## 5. Buttons (9-slice unless noted)

| File | Used for | Size at 1080p | States |
|---|---|---|---|
| `ui/btn.png` | ordinary text buttons: CRAFT, DONE in windows, map toggles, seed GO, COPY | height about 30 (12px text + padding), width fits the text | normal, `-hover`, `-pressed`, `-disabled`, `-focus` (keyboard ring), `-on` (a toggle that's lit, for example NAMES: ROADS) |
| `ui/btn-primary.png` | the one big button on a sheet: SET OUT, RISE AGAIN IN TOWN, DONE in Options | full sheet width × 44 | normal, `-hover`, `-pressed`, `-disabled` (SET OUT while loading) |
| `ui/btn-small.png` | top-right HUD buttons: OPTIONS, TUNE, GPU, HIDE UI, SHOW UI | about 70×24 (9px text) | normal, `-hover`, `-pressed` |
| `ui/btn-close.png` | the X on every window (mockup square brass X) | 26×26 fixed | normal, `-hover` (red), `-pressed` |
| `ui/btn-act.png` | square buttons under the pack: REFINE, STASH (an icon inside) | 0.62 × cell ≈ 31px | normal, `-hover`, `-off` (not on your plot) |
| `ui/btn-trash.png` | drop zone to destroy an item | 31px | normal, `-drop` (red, an item hovering over it) |
| `ui/compass.png` | the round north button on the minimap (mockup brass medallion with N and needle) | 26 to 34px circle, fixed | normal, `-hover`, `-on` (north locked, gold). **It rotates** to point north, so draw it upright with the needle pointing up. The red north pointer can be part of it. |

---

## 6. Bars and meters (3-slice horizontal: left cap, middle, right cap)

Each bar is three images: an empty **frame/track**, a **fill** (stretched or clipped to the % from the left), and in some cases a second fill.

| Files | Used for | Size at 1080p | Notes |
|---|---|---|---|
| `ui/bar-health-frame.png`, `-fill.png`, `-lag.png` | hero health on the health plate (mockup red bar) | 150×14 inside the plate | `lag` is a pale fill that trails behind when you're hit. Fill red. |
| `ui/bar-xp-frame.png`, `-fill.png`, `ui/bar-xp-tick.png` | experience bar, the full screen width along the very bottom, in 20 sections | 100vw × 12 | The middle must tile across about 1900px. `tick` is the divider drawn 19 times (2 to 4px wide). Fill blue. Not in the mockup: please design it to match. |
| `ui/bar-progress-frame.png`, `-fill.png` | station progress (mockup "Grinding… 62%"), loading bar on the start sheet | 160×14; loading full sheet width × 10 | Fill gold. |
| `ui/bar-target-frame.png`, `-fill.png` | the big health bar at top centre for the foe you point at | 420×12 | **Fill must be white or greyscale** because each kind of foe tints it (wolf, skeleton and so on, set per foe in code). |
| `ui/bar-foe-frame.png`, `-fill.png` | small health bars over foes' heads | 44×5 | Tiny: a plain dark track with a 1px rim is enough. Fill greyscale, tinted per foe. |
| `ui/ring-level.png` | level number in a ring (hero: left of health, mockup "2"; foes: left of their bars) | hero 36px, foe 30px, target 40px | Fixed circle. **The coloured inner ring is tinted in code** (hero blue, foes the foe's colour), so deliver the ring as a separate greyscale `ui/ring-level-tint.png` on top of a neutral `ui/ring-level.png` base. |

---

## 7. Small pieces and glyphs (fixed size, transparent)

| File | Used for | Size at 1080p |
|---|---|---|
| `ui/arrow-refine.png` | the arrow from input to output in the station window (mockup) | about 60×40 |
| `ui/flourish-corner.png` | parchment corner flourishes | about 40×40 |
| `ui/tag-build-mode.png` | the BUILD MODE banner (9-slice, gold) | text width × 28 |
| `ui/prompt-key.png` | the key box in "**F** Use" prompts that float in the world | 9-slice, 30px tall |
| `ui/cursor-pad.png` | the controller's build cursor (now a 14px gold diamond) | 16×16 |
| `ui/cursor-default.png`, `ui/cursor-crosshair.png`, `ui/cursor-move.png` | optional custom mouse cursors | 32×32, with the hot spot given |
| `ui/icon-refine.png`, `ui/icon-stash.png`, `ui/icon-trash.png` | glyphs on the refine, stash and trash buttons (pixel art today) | 256 masters, like the other painted icons |
| `ui/slot-empty-{head,chest,legs,boots,weapon,amulet}.png` | faint markers in empty gear squares (mockup: the helmet, torso and so on drawn dim) | 256 masters |
| Touch controls: `ui/touch-stick.png` (base), `ui/touch-knob.png`, `ui/touch-btn.png` (`-held`), `ui/touch-btn-big.png` | the phone's on-screen stick and buttons | base 132, knob 56, buttons 62, attack 92 (circles) |

---

## 8. Typography and colour

- **Fonts today:** "Press Start 2P" (titles, labels, numbers) and "VT323" (body text), both pixel fonts from Google Fonts. The mockup uses a **serif** (titles like "Character", "Backpack", "Grinder") and a small caps serif for labels. Please **name the fonts** (Google Fonts only, so they can load in the page), for example Cinzel, Cormorant, IM Fell, Alegreya SC or Spectral.
- **Text sizes at 1080p:** window titles 15 to 22px, labels 10 to 14px, slot names about 10px, stack counts 8 to 10px, body text 17 to 22px. A serif will want about 1.4× these sizes.
- **Colour tokens** to replace (give a value for each, sampled from the art):

| Token | Role today | Today |
|---|---|---|
| `--void` | page background, text on light buttons | #0b0912 |
| `--panel` | panel fill (becomes parchment) | #282430 |
| `--panel-edge` | borders (becomes leather) | #4e425f |
| `--well` | slot interior | #211e26 |
| `--bone` | main text | #efe4c8 |
| `--dim` | secondary text, labels | #a69ab3 |
| `--gold` | highlights, selection, headings | #f2c14e |
| `--ember` | primary button, title accent | #e8743b |
| `--wisp` | calm messages, focus ring | #8de8dc |
| `--blood` | damage, errors, close hover | #d8443a |

Note: in the mockup, text sits on **light parchment** (dark brown text) inside windows but on **dark leather** in slots and plates (light text). Please give text colours for both backgrounds.

---

## 9. Checklist for the asset maker

1. Every file in sections 3 to 7, at 2× the listed CSS size, in all states listed.
2. A table of slice insets, content insets, outsets and repeat modes for every 9-slice and 3-slice.
3. Fill images for bars that are tinted in code (target bar, foe bar, level ring) in white or greyscale.
4. The two fonts, and the colour tokens for parchment and leather backgrounds.
5. One composite screenshot, laid out like the mockup, built only from the delivered files, so I can check that nothing is missing.
