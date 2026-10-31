# Wanderer’s Kit — Crafting coding handoff

Replace the existing generic crafting recipe rows with a shared two-column crafting window and one of three bespoke background skins. Weapons, armor and alchemy share the same recipe-list, item-preview, materials and action geometry. Change the frame art and recipe data when the station changes; keep interaction behavior and button placement consistent.

The latest approved change removes the Quantity label, number field and minus/plus controls. Craft always requests one recipe execution. Use that space for materials: four visible rows, with scrolling for longer recipes. The production previews are the current visual target; the earlier mockups in `reference/` retain the superseded quantity controls.

This package is a standalone addition to Desktop V3, not a replacement for the world-map or inventory packages. The refining window remains its existing four-output design. No application repository has been edited here.

## Installation and rendering

Install `ui/crafting/`, `css/crafting.css`, `js/crafting.js` and the Spectral font files with their OFL license. Preserve directory relationships, or pass an explicit asset base to the class. The class normalizes that base to an absolute document URL before assigning CSS image variables, so stylesheet-relative resolution cannot break dynamically selected skins. Serve all assets from the application’s normal asset pipeline. The standalone preview also opens with file URLs.

All 25 production PNGs are text-free sRGB straight RGBA. Main frames include blank opaque parchment, a blank title plaque and blank close housing. Transparent exterior pixels allow the game scene to show around the silhouette. Artwork for the shared controls is separate. Use CSS for live labels, counts, focus rings, shortage indicators and shadows.

The files are fixed exports, not runtime nine-slice borders. This deliberate change preserves the station ornaments, buckles, copper joints and glassware at the approved proportions. Do not apply the original brief’s generic `border-image` slicing to these files. `manifest.json` gives source/display dimensions, safe content insets, zero slice insets and zero outsets; `layout.json` defines precise placements.

## Shared geometry

Use `s = min(viewportWidth / 1920, viewportHeight / 1080)`, matching Desktop V3. The complete logical window is 960×640. Center it at `(viewportWidth/2 − 480*s, viewportHeight/2 − 320*s)` and scale the group uniformly from its top-left. At 1920×1080 its origin is `(480,220)`. This includes decorative margins. Do not independently stretch the border or move controls between skins.

| Element | Window-local logical rect x,y,w,h | Behavior |
|---|---|---|
| Complete background | 0,0,960,640 | `frame-weapon`, `frame-armor` or `frame-alchemy`; source 1920×1280. |
| Title | 305,43,345,43 | Live station title; Spectral 600, 31px. |
| Close | 836,46,50,50 | Shared square skin and live ×. |
| Recipe heading | 204,127,144,35 | Live Recipes label. |
| Recipe viewport | 110,169,330,310 | Three 100px cards with 5px gaps; vertical scrolling beyond three. |
| Recipe icon | 14,8,84,84 within card | Existing item icon, contained with original aspect ratio. |
| Recipe name | x107, width207 within card | Center vertically; up to two lines. |
| Selected item title | 490,128,350,36 | Live text; long names ellipsize with title tooltip. |
| Preview frame | 570,179,200,180 | Image element is 186×172 at local 7,4. |
| Materials heading | 607,359,127,31 | Same placement on every skin. |
| Materials panel | 506,391,330,120 | Owned/Needed caption above four 24px rows. |
| Materials scroller | 10,19,310,96 within panel | Scroll for all additional requirements. |
| Craft | 490,517,350,54 | Single shared primary action. Never moves with material count. |
| Live status | 111,535,327,38 | Selection hint, shortage, completion or failure. |

Use the supplied CSS for ornamental dividers and full text metrics. Dark text on parchment is `#2e190e`; light text on leather is `#f6e4bd`. Materials use 16px text; recipe labels 22px; Craft 29px. All sizes above precede global scaling. Spectral 400/600 is bundled. Touch and compact mobile layouts are outside this desktop pass.

The default reference window is centered and fixed in place. If the game’s window manager supports dragging, bind its existing drag behavior to the title header and exclude the close control; preserve all local coordinates. The reference does not add its own dragging or persistent window-position system.

## UX changes from the current implementation

| Current / earlier pattern | Replacement |
|---|---|
| Recipe rows each have their own Craft button and cost/about text | Left-side selectable recipe cards; one shared right-side details/materials view and one Craft action. |
| Different alchemy interior arrangement | The same weapons-based two-column layout and action positions. Copper tubing, flask, beaker, herbs and bottles remain decorative border art. |
| Quantity, plus/minus, potential Craft All or batch state | Remove these controls/state paths from this window. Send count 1 per activation. Do not carry a hidden previous multiplier into the adapter. |
| Small cost area | Four visible rows and an independently scrolling materials list for further requirements. |
| Separate DONE footer action | Close with the common upper-right × or the game’s existing close binding. The reference handles Escape while focus is inside. |
| Generic crafting panel skin | Choose one of the three fixed backgrounds; shared control art and coordinates remain unchanged. |

All recipe cards remain inspectable when resources are insufficient. Highlight the selected card in gold. Shortages use live owned/needed counts and an underline/red text treatment, plus an explicit status sentence; color is not the only cue. Disabled/locked recipes may still be selected to inspect their details; the action is blocked with the supplied reason.

Do not truncate away required materials when a recipe has more than four ingredients. Preserve all requirements and scroll that region. The left recipe list likewise scrolls for larger catalogs. Do not add a queue, automatic repeat, shift-click batch or hidden quantity multiplier. Each discrete Craft activation sends count 1; repeated keydown events on the Craft button are suppressed. Native Space/Enter activation and pointer clicks remain supported.

One activation means one execution of the selected recipe, without multiplying its costs or output. The demo yields one inventory item. Keep real recipe definitions authoritative when adapting existing recipe yields; do not copy illustrative costs or invent new recipes as part of this reskin.

## Data and adapter contract

`WandererCraftingView` is a framework-free reference UI class. It does not know the game’s actual station IDs, recipe store, inventory API or crafting function names. The adapter names below are illustrative inputs, not claimed existing project APIs.

```js
const view = new WandererCraftingView({
  parent: document.body,
  assetBase: './ui/crafting/',
  station: 'weapon', // skin identity: weapon | armor | alchemy
  recipes: recipeAdapterData,
  getOwned: itemId => readCurrentInventoryCount(itemId),
  getBlockReason: (recipe, station) => gameCraftingBlockReason(recipe, station),
  onCraft: async ({stationId, recipeId, count}) => {
    // count is always 1. Map the skin identity to the actual station/context.
    // Validate and consume/create atomically using the game's existing logic.
    return executeOneCraftInGame({stationId, recipeId, count});
  },
  onClose: () => closeGameCraftingWindow(),
  onError: error => logCraftingAdapterError(error)
});
// Create/open only when the game requests the station, or hide during setup.
view.open({focus: true});
```

Recipe shape:

```js
{
  id: 'actual-game-recipe-id',
  name: 'Localized recipe name',
  icon: '/existing-item-icon.webp',
  disabledReason: '', // optional localized unlock/station restriction
  costs: [
    {id: 'actual-material-id', name: 'Localized material name',
     icon: '/existing-material-icon.webp', amount: 3}
  ]
}
```

Material amounts must be positive safe integers. Recipe IDs must be unique. Duplicate material IDs in one recipe are merged before affordability checks and display. `getOwned` supplies current nonnegative item counts; missing counts display zero. The fixture data is not production balance data. Use the existing item-icon registry/WebP sizes in the actual game; `demo/icons/` is only for the reference assembly.

`getBlockReason(recipe, station)` returns an empty value when the game allows the action or a localized explanation such as insufficient station access, recipe locked or inventory full. The UI checks this alongside costs and `disabledReason`. Missing `onCraft` disables Craft instead of pretending to create an item. The full authoritative validation belongs in `onCraft`: confirm the station/context is still valid, the recipe is unlocked, all resources are available and output capacity exists, then consume and create in one transaction. The UI’s display checks are not a replacement for those game rules.

`onCraft` receives a frozen `{stationId, recipeId, count: 1}` object. A returned `{ok:false, message}` or `false` displays failure. A resolved successful result (`{ok:true}` or no explicit false result) shows completion. A thrown/rejected error displays a generic retry message and invokes `onError`. Return success only after the actual game transaction succeeds.

While awaiting that result, Craft and recipe selection are disabled and additional calls return false without a queued transaction. Do not also bind another handler directly to the shared Craft button: that would create duplicate requests. `setStation` and `setRecipes` reject changes while pending. Close stays available, and closing does not cancel or repeat an already submitted game transaction. Reopening refreshes counts. If cancellation is a game feature, coordinate it in the game manager rather than treating a hidden DOM panel as a transaction cancel.

## Refresh, lifecycle and input

Call `refresh()` after inventory, unlock, access or capacity changes. It rereads counts and block reasons. Call `setStation('armor', recipes)` or `setStation({id:'alchemy',title:localizedTitle}, recipes)` to swap station data and skin. `setRecipes(recipes)` replaces the list; `selectRecipe(id)` selects one. `selectedRecipe` exposes the normalized selected data. There is no quantity setter.

`open({focus:true})` saves prior external focus and focuses the close button. `close()` hides the window, calls `onClose`, emits `crafting:close` and restores prior focus if it still exists; repeated close calls are ignored. `onClose` should notify the game’s UI/input manager rather than recursively call this view’s close method. New craft requests are blocked while the window is hidden. Successful requests emit `crafting:crafted` on the root; use the callback for transactions and the event for optional observers, never both to execute the craft. `destroy()` removes DOM and aborts listeners. It does not undo a transaction already submitted to the game.

The reference dialog is nonmodal (`aria-modal=false`) and has no focus trap. The game’s UI manager must own world-input suppression, overlapping windows, actual keybindings and modal policy. The class handles Escape inside its root; do not add a competing close loop. Recipe controls support native keyboard activation plus Up/Down/Home/End navigation and scrolling. The materials scroller is keyboard focusable. Keep keyboard focus visibly distinct from selection.

Live strings are separate from the skins. The supplied class uses English labels; connect those literals and status messages to the game’s localization system as needed. Longer text is constrained to fixed geometry with tooltips/accessible labels; production translations should be checked in the target locales.

## States, art provenance and validation

The package has three blank frame skins; normal/hover/pressed/selected/selected-hover/selected-pressed/focus/poor recipe cards; normal/hover/pressed/disabled/focus/busy Craft skins; four close states; materials panel, preview border and dividers. Follow the supplied CSS priority so selected state survives hover and focus gets its own outline. The busy label is live Crafting… and is independent of the PNG.

Frame/component artwork was prepared with the built-in image generator from the approved mockups, then technically cropped, aligned, resampled and color-adjusted into state exports. The prompt set is in `PROMPTS.json`. Main frames were generated at 1536×1024 and exported at 1920×1280. `manifest.json` records delivery dimensions and hashes. This is 2× delivery packaging, not a claim of native 4K painting.

The existing painted weapon/material icons used in the proof retain their existing role. Armor/potion/herb/thread proof icons are cropped reference imagery and may be softer when enlarged. They are not production icon replacements. Replace all proof icons with the game’s current item registry. The original reference images include quantity controls only as historical art references; those controls are removed from the current assemblies.

`browser-validation.json` covers all three skins at five desktop resolutions, loaded assets, identical control placement, absence of quantity UI, four visible ingredient rows, additional-row scrolling, fixed Craft position, single count 1 requests, pending protection, shortages, activation-time rechecks, availability gates, merged duplicate costs, selection, keyboard navigation/focus, callback failures, close/reopen and teardown. `asset-validation.json` covers PNG formats, alpha, dimensions, hashes and source links. These validate the standalone reference; the coding agent still needs to check actual gameplay transactions, item icons, localization, input ownership and renderer performance in the game.
