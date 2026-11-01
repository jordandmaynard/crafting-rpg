# Wanderer's Kit — crate storage production handoff

The crate window is a separate plot-storage window with ten cells. The normal artwork follows the approved open-crate mockup: worn oak rim, iron corner braces, brass fasteners, deep inner timber walls and a dark recessed 5×2 compartment grid. Header lettering and the X button have been removed from the frame so they can be drawn as live layers.

## Included production textures

| File | Pixel dimensions | Render size / purpose |
| --- | --- | --- |
| `assets/crate-window-normal@2x.png` | 1680×960 | Full frame at 840×480 logical |
| `assets/crate-window-normal.png` | 840×480 | 1× alternative |
| `assets/crate-close-normal@2x.png` | 72×72 | Close button at 36×36 logical; X retained |
| `assets/crate-close-normal.png` | 36×36 | 1× alternative |
| `assets/crate-slot-tint-mask@2x.png` | 224×196 | White coverage mask at 112×98 logical |
| `assets/crate-slot-tint-mask.png` | 112×98 | 1× mask alternative |

The two resolutions are the same normal art, not state variants. Use 2× textures with explicit logical dimensions; do not render them at native 2× size by accident. Preserve RGBA, sRGB and square pixels. Keep transparent outer corners; opaque plank bottoms are intentional. Do not flatten the crate over a background.

The normal frame already contains the ten empty compartment artworks. Do not add the old inventory cell frame over them, and do not draw another copy of a cell normal texture. Item icons, quantities, drop targets, selections and tooltips remain live.

## Exact layout

All rectangles are `[x,y,width,height]` relative to the 840×480 window. `layout.json` is the machine-readable source. The PNG’s transparent pixel corners do not affect its coordinate origin.

| Layer | Rectangle / settings |
| --- | --- |
| Frame | `[0,0,840,480]` |
| Live title | `[124,48,360,48]`; Georgia/Times serif, 35px bold, `#29180f`; one line, ellipsis |
| Live capacity | `[500,51,180,44]`; same serif, 28px regular, `#5a351c` |
| Close | `[768,16,36,36]` |
| Drag handle | `[78,38,650,74]`; exclude the close button |

The live capacity label is **occupied item slots / 10**, not a sum of stack quantities. Bind the real storage data. The preview’s `0 / 10` and `3 / 10` are examples, not baked values. The title comes from the crate’s current name/type. Keep its width bounded so a long name cannot overlap capacity.

| Index | Row / column | Well hit area and tint mask | Item rectangle | Quantity rectangle |
| --- | --- | --- | --- | --- |
| 0 | 1 / 1 | `[106, 154, 112, 98]` | `[117, 161, 90, 84]` | `[166, 229, 46, 22]` |
| 1 | 1 / 2 | `[234, 154, 112, 98]` | `[245, 161, 90, 84]` | `[294, 229, 46, 22]` |
| 2 | 1 / 3 | `[362, 154, 112, 98]` | `[373, 161, 90, 84]` | `[422, 229, 46, 22]` |
| 3 | 1 / 4 | `[490, 154, 112, 98]` | `[501, 161, 90, 84]` | `[550, 229, 46, 22]` |
| 4 | 1 / 5 | `[618, 154, 112, 98]` | `[629, 161, 90, 84]` | `[678, 229, 46, 22]` |
| 5 | 2 / 1 | `[106, 276, 112, 98]` | `[117, 283, 90, 84]` | `[166, 351, 46, 22]` |
| 6 | 2 / 2 | `[234, 276, 112, 98]` | `[245, 283, 90, 84]` | `[294, 351, 46, 22]` |
| 7 | 2 / 3 | `[362, 276, 112, 98]` | `[373, 283, 90, 84]` | `[422, 351, 46, 22]` |
| 8 | 2 / 4 | `[490, 276, 112, 98]` | `[501, 283, 90, 84]` | `[550, 351, 46, 22]` |
| 9 | 2 / 5 | `[618, 276, 112, 98]` | `[629, 283, 90, 84]` | `[678, 351, 46, 22]` |

Use row-major indices 0–4 above 5–9. Keep the fixed ten-cell capacity. The artwork does not authorize a change to stack limits, accepted item categories, ownership permissions, persistence or transfer behavior.

## Scaling and placement

Treat the complete crate artwork as a fixed-aspect panel. **Do not nine-slice the whole texture:** the compartments and their proportions would distort. A separate border-only scalable version is not part of this approved ten-cell design.

At the target desktop size, use 840×480 logical pixels. Where needed, apply one uniform scale to the frame, title, close button, masks, items and hit areas together. The reference preview supports 0.8–1.0 desktop scaling; below that range choose an appropriate game window arrangement rather than compressing only the grid. Convert pointer coordinates by the same scale. Use linear filtering, preserve alpha, and avoid lossy compression that damages the wooden edges or button glyph.

Open this as an independently controlled storage window. Opening it must not automatically open or close the player's inventory. Closing it must not close the player's inventory. Allow both to remain open for transfers. Reuse the game's window manager, focus, dragging and z-order rules. Place the crate beside inventory where room permits; otherwise keep it draggable and bring only the active window forward. The frame image must not intercept pointer input.

## States — tints only

Reuse the normal frame and close button for every state. Apply a separate color overlay clipped by the well mask at each slot rectangle, **above the wooden well and below the item icon/count**. The mask must not tint adjacent timber dividers or other slots. Do not make hover/selected/unavailable PNG copies.

| State | Overlay / behavior |
| --- | --- |
| Normal | No overlay |
| Hover | `rgba(255,209,132,0.16)` |
| Selected | `rgba(239,173,63,0.30)` |
| Selected + hover | `rgba(255,199,91,0.38)` |
| Unavailable | `rgba(23,18,15,0.52)`; block activation/transfer, optionally grayscale/dim item |
| Keyboard focus | `rgba(137,209,239,0.25)`; retain an accessible visible focus indicator |

Unavailable takes precedence over hover and selection. Hovering or selecting must not change slot size, position or window geometry. Availability is supplied by game rules; an empty slot is not automatically unavailable. A selected slot does not transfer or mutate contents on its own.

Close hover uses `brightness(1.14) saturate(1.06)` on the same image. The optional pressed effect uses the same image translated down 1px with `brightness(0.91)`; no unique pressed artwork is required. Focus styling is a live outline. If applying disabled styling, use a tint/filter and block the associated action.

## Reference adapter and preview

`demo/index.html` opens directly from the unpacked folder. Its empty/sample/state/reopen buttons are review controls **outside the game window**, not additions to the game UX. Sample sword/axe/hammer images in `demo/items/` are review data only.

`integration/crate-window.css` and `integration/crate-window.js` provide a framework-neutral DOM reference. Load the CSS and classic script, then add `<wk-crate-window>`. Its API is:

```js
crate.setContents(items); // up to 10 entries; null means empty
// Item shape: { id, label, iconUrl, quantity }
crate.open(crateId, 'Wooden Crate');
crate.setSelected(index); // -1 clears
crate.setSlotUnavailable(index, true);
```

Supply the correct crate snapshot before opening a different crate. Do not use the preview's local `items` array as authoritative game storage. Bind events to existing game controllers:

| Event | Detail / integration |
| --- | --- |
| `crate-slot-activate` | `crateId`, `index`, `item`; bind existing selection/activation rules |
| `crate-slot-context` | Same target; bind current context menu behavior |
| `crate-slot-drop` | Same target plus native `dataTransfer`; validate with existing drag/drop controller |
| `crate-drag-start` | `crateId`, `pointerEvent`; bind window manager movement |
| `crate-close-request` | `crateId`; cancelable so pending operations can finish before hiding |

The adapter emits requests; it does not implement game transfers, save state, authorization or a new double-click/shift-click policy. Reuse existing item tooltips, drag payloads, transfer shortcuts and conflict validation. Add the game's normal item drag-start behavior if using this adapter directly. Integrate Escape handling with the topmost-window rule and restore focus to the opening control on close. Keep keyboard slot navigation and accessible close labeling.

## Differences from the current screenshot

- Parchment backing becomes the recessed open-crate interior.
- The ten cells keep their 5×2 order but use the dimensions and positions above.
- Each cell's normal wooden compartment is included in the whole-window artwork; the old `.cell` background is suppressed for this window only.
- Default panel size is 840×480 logical, close to the screenshot's roughly 806×478 panel. Use the new coordinates rather than retaining old padding.
- Header title/count and close control remain live and are layered over the new texture.
- Hover and other interaction states use masks/tints; there are no alternate painted state frames.

## Validation and limits

PNG dimensions, alpha, opacity of the crate interior, source aspect ratio and archive integrity were checked. Visual proofs composite the final production textures at the exact layout coordinates, including live text placement and tint examples. Reference JavaScript passed a syntax check. No browser binary was available for an execution check, so the DOM adapter still needs browser/in-game integration QA; these files do not modify the game repository.

Before shipping, the coding agent should verify populated and empty slots, counts and tooltips, accepted/rejected drops, transfer persistence, crate + inventory simultaneously open, independent close/focus, window dragging at the selected scale, and title truncation. The previews are review material, not game textures. `source/` contains the blank generation master for future exports; the exact built-in edit prompt is retained in `generation-prompt.txt`.
