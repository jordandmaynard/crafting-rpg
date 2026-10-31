# Wanderer’s Kit — UI state artwork policy

Use one normal image for each distinct frame, slot or button shape. Hover, selected and unavailable states are live tints of that image. Apply the same rule to future UI production assets.

| State | Rendering | Separate image? |
|---|---|---|
| Normal | Original surface | One source image |
| Hover | Slightly brighter/warmer tint | No |
| Selected | Persistent warm/gold tint | No |
| Pressed | Darker tint; CSS offset if useful | No, when tint/transform suffices |
| Unavailable | Desaturate and dim the normal surface | No |
| Keyboard focus | Visible CSS outline, independent of selection | No |
| Accepted drop | Live warm highlight | No |
| Different physical state | Changed shape, depth, silhouette or geometry | Only when a tint/transform cannot represent it |

Tint the surface layer rather than accidentally recoloring live labels, counts or item icons. An unavailable appearance must be paired with the game’s actual interaction guard. Keep focus visible on selected or tinted controls. Do not add automatic selection or change gameplay behavior merely to demonstrate a visual state.

The refining set now contains only 16 normal PNGs. Its CSS and state gallery demonstrate this policy without alternate state textures.
