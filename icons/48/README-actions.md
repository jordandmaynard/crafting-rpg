# RPG general action icons

Four general action symbols matching the game's pixel-art inventory aesthetic. These are reusable UI symbols and have no material tiers.

| File | Action | Symbol |
| --- | --- | --- |
| action-dash-48x48.png | Dash | Right-facing leather boot and three cyan motion marks |
| action-inventory-48x48.png | Inventory / Pack | Leather backpack with brass buckle |
| action-build-48x48.png | Build | Iron crafting hammer with wooden handle |
| action-map-48x48.png | Map | Parchment, green land and blue water |

Every individual PNG is exactly 48×48 pixels including its one-pixel black outer contour. Alpha is binary (0 or 255). Black appears only where the opaque symbol touches transparency, including openings; interior shadows use material colors. All four pass checks for zero interior black pixels, zero solid 2×2 black blocks, and a complete contour.

Import with nearest-neighbor / point filtering. Preserve alpha, use whole-pixel placement and integer display scales, and avoid lossy texture compression. Do not color-key black or add a second outline.

Icons contain no keyboard shortcuts, button borders, labels, or UI backgrounds. Place those elements separately in your interface so bindings can change independently.

actions-atlas-48px.png is 192×48, containing four 48×48 cells in the table order above with no spacing. actions-atlas.json supplies exact rectangles using a top-left pixel origin. actions-preview.png shows the exact final sprites at 4× nearest-neighbor scale; its gray background and labels are only for review.

Weapon attacks and buildable structures / stations are pending the user's in-game references and are not included here.

Artwork used built-in image generation followed by exact-size pixel cleanup. PROMPTS.json retains the generation prompts, and validation.json records the checks.
