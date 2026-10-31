# World map asset specification

All production PNGs use straight RGBA with sRGB ICC metadata. Export scale is 2× nominal logical size. Transparent pixels have zero RGB. Fixed assets have zero slice insets and outsets; apply group scale and CSS shadow as documented. `manifest.json` carries hashes and exact per-file fields.

| File | Source pixels | Display at 1080p | State |
|---|---|---|---|
| `ui/map/frame-body.png` | 2672×1600 | 1336×800 | normal |
| `ui/map/title-plaque.png` | 1120×152 | 560×76 | normal |
| `ui/map/close.png` | 88×88 | 44×44 | normal |
| `ui/map/close-hover.png` | 88×88 | 44×44 | hover |
| `ui/map/close-pressed.png` | 88×88 | 44×44 | pressed |
| `ui/map/close-focus.png` | 88×88 | 44×44 | focus |
| `ui/map/tab-places.png` | 336×164 | 168×82 | normal |
| `ui/map/tab-places-hover.png` | 336×164 | 168×82 | hover |
| `ui/map/tab-places-pressed.png` | 336×164 | 168×82 | pressed |
| `ui/map/tab-places-on.png` | 336×164 | 168×82 | on |
| `ui/map/tab-places-focus.png` | 336×164 | 168×82 | focus |
| `ui/map/tab-places-disabled.png` | 336×164 | 168×82 | disabled |
| `ui/map/tab-roads.png` | 336×164 | 168×82 | normal |
| `ui/map/tab-roads-hover.png` | 336×164 | 168×82 | hover |
| `ui/map/tab-roads-pressed.png` | 336×164 | 168×82 | pressed |
| `ui/map/tab-roads-on.png` | 336×164 | 168×82 | on |
| `ui/map/tab-roads-focus.png` | 336×164 | 168×82 | focus |
| `ui/map/tab-roads-disabled.png` | 336×164 | 168×82 | disabled |
| `ui/map/tab-terrain.png` | 336×164 | 168×82 | normal |
| `ui/map/tab-terrain-hover.png` | 336×164 | 168×82 | hover |
| `ui/map/tab-terrain-pressed.png` | 336×164 | 168×82 | pressed |
| `ui/map/tab-terrain-on.png` | 336×164 | 168×82 | on |
| `ui/map/tab-terrain-focus.png` | 336×164 | 168×82 | focus |
| `ui/map/tab-terrain-disabled.png` | 336×164 | 168×82 | disabled |
| `ui/map/tab-waters.png` | 336×164 | 168×82 | normal |
| `ui/map/tab-waters-hover.png` | 336×164 | 168×82 | hover |
| `ui/map/tab-waters-pressed.png` | 336×164 | 168×82 | pressed |
| `ui/map/tab-waters-on.png` | 336×164 | 168×82 | on |
| `ui/map/tab-waters-focus.png` | 336×164 | 168×82 | focus |
| `ui/map/tab-waters-disabled.png` | 336×164 | 168×82 | disabled |
| `ui/map/tab-markers.png` | 336×164 | 168×82 | normal |
| `ui/map/tab-markers-hover.png` | 336×164 | 168×82 | hover |
| `ui/map/tab-markers-pressed.png` | 336×164 | 168×82 | pressed |
| `ui/map/tab-markers-on.png` | 336×164 | 168×82 | on |
| `ui/map/tab-markers-focus.png` | 336×164 | 168×82 | focus |
| `ui/map/tab-markers-disabled.png` | 336×164 | 168×82 | disabled |
| `ui/map/fog-parchment-tile.png` | 1024×1024 | 512×512 | normal |
| `ui/map/glyph-places.png` | 84×84 | 42×42 | normal |
| `ui/map/glyph-roads.png` | 84×84 | 42×42 | normal |
| `ui/map/glyph-terrain.png` | 84×84 | 42×42 | normal |
| `ui/map/glyph-waters.png` | 84×84 | 42×42 | normal |
| `ui/map/glyph-markers.png` | 84×84 | 42×42 | normal |
| `ui/map/compass-rose.png` | 256×256 | 128×128 | normal |

`ui/map/compass-rose.svg` is the editable compass source, not an additional PNG. Bookmark glyphs are resampled reference cutouts; keep their 42×42 nominal display size. Paper repeats at 512×512 and is always opaque. The title, button labels, ×, cardinal letters and scale are separate live layers. See the coding handoff for placement, state priority and renderer contract.

The five bookmark colors share the same silhouette. Each has normal/hover/pressed/on/focus/disabled artwork. Focus also receives the CSS outline. The focus PNG reuses the selected art; the outline supplies distinct keyboard focus.

Only `ui/map/` is new production art. `demo/` contains screenshot content, an illustrative mask and prior V3 HUD dependencies for the standalone preview. Do not overwrite V3 assets with demo files.
