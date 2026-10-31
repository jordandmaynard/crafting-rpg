# Refining frame asset specification

16 normal PNGs, sRGB straight RGBA, at 2× nominal display size. All controls reuse their normal artwork for runtime tint states. No separate hover/selected/unavailable or pressed-state images. Fixed assets; slice insets/outsets zero, repeat none, shadows CSS. Content insets below are safe padding rather than slice definitions.

| File | Export px | Display px | Content inset L,T,R,B (display px) |
|---|---|---|---|
| `ui/refining/frame-saw-table.png` | 1600×960 | 800×480 | 60,150,60,76 |
| `ui/refining/close-saw-table.png` | 86×84 | 43×42 | 6,6,6,6 |
| `ui/refining/frame-grinder.png` | 1600×960 | 800×480 | 60,150,60,76 |
| `ui/refining/close-grinder.png` | 94×98 | 47×49 | 6,6,6,6 |
| `ui/refining/frame-smelter.png` | 1600×960 | 800×480 | 60,150,60,76 |
| `ui/refining/close-smelter.png` | 86×86 | 43×43 | 6,6,6,6 |
| `ui/refining/frame-tanning-rack.png` | 1600×960 | 800×480 | 60,150,60,76 |
| `ui/refining/close-tanning-rack.png` | 116×106 | 58×53 | 6,6,6,6 |
| `ui/refining/slot-saw-table-input.png` | 220×220 | 110×110 | 13,13,13,13 |
| `ui/refining/slot-grinder-input.png` | 220×220 | 110×110 | 13,13,13,13 |
| `ui/refining/slot-smelter-input.png` | 220×220 | 110×110 | 13,13,13,13 |
| `ui/refining/slot-tanning-rack-input.png` | 220×220 | 110×110 | 13,13,13,13 |
| `ui/refining/slot-saw-table-output.png` | 220×220 | 110×110 | 13,13,13,13 |
| `ui/refining/slot-grinder-output.png` | 220×220 | 110×110 | 13,13,13,13 |
| `ui/refining/slot-smelter-output.png` | 220×220 | 110×110 | 13,13,13,13 |
| `ui/refining/slot-tanning-rack-output.png` | 220×220 | 110×110 | 13,13,13,13 |

Window/slot geometry, title and close positions are in `layout.json`. Interaction tint values are CSS variables in `css/refining.css`; the tint is applied to the normal surface pseudo-element, keeping live contents independent. Selected and hover states are independent of keyboard focus. Unavailable uses the same image with desaturation and dimming.

Original artwork was 1619×971. Full frames are uniformly fitted into 1600×960; separate normal slots are normalized to 220×220 for 110px use. No center machine icon, arrow or progress graphics were made.

Separate state artwork is appropriate only for genuinely different geometry/silhouette or a physical change that a tint/CSS transform cannot produce. None is required here. See `UI_STATE_POLICY.md`.
