# Emberwild sandstone icon delta

Seven new painterly inventory icons. Use the files in `icons/` for the game; `masters/` contains the larger painted sources with cleaned binary alpha. Each filename matches the supplied case-sensitive icon ID.

| Icon ID | Display name | Production file |
|---|---|---|
| sandfloor | Sandstone Floor | icons/sandfloor.png |
| sandtimber | Sandstone Timber Wall | icons/sandtimber.png |
| sandtimberwindow | Sandstone Timber Window | icons/sandtimberwindow.png |
| sandwall | Sandstone Wall | icons/sandwall.png |
| sandwindow | Sandstone Window | icons/sandwindow.png |
| sandfence | Sandstone Fieldstone Wall | icons/sandfence.png |
| sandstoneBlock | Sandstone Blocks | icons/sandstoneBlock.png |

## Import

- All production icons are lossless **256 × 256 RGBA PNGs** with **1-bit alpha**: alpha is only 0 or 255. Transparent RGB is zeroed.
- No black outline is baked in. Apply any shared inventory outline in the game using the existing treatment.
- Buildables follow the supplied orthographic game view (30 degrees down, 45 degrees around / 1:2 isometric). Sandstone Blocks is a resource item stack.
- Keep each image's square canvas and aspect ratio; do not crop it to a rectangular object bound. Art has at least 12 pixels of canvas clearance.
- Materials retain the pale sandstone, turquoise details and brown latticework of the supplied render set. No scene backgrounds or ground shadows are included.
- Preserve the exact ID `sandstoneBlock`, including its capital B.
- The supplied `sandtimber` render depicts an arched lattice inset despite its Wall label. Its painted icon follows that render; `sandtimberwindow` retains the separate projecting wooden lattice box. Do not interchange these IDs.

The sandstone-block item was requested in the reference README without its own render; it is represented by a stack of three refined blocks in the same sandstone palette.

`preview.png` shows all icons at 256px and 64px. `icons.json` lists file paths, dimensions, alpha checks and subject bounds. These are isolated UI icons, not world textures or sprite replacements.
