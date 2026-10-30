# Painterly active sword abilities — 256×256

Three full-color, full-bleed opaque action icons. No material-tier variants, text, keyboard shortcuts, or button frames are baked into the art.

| File | Ability | Visual cue |
| --- | --- | --- |
| ability-sword-slash-256x256.png | Sword Slash | Single blue-white crescent swipe |
| ability-whirlwind-256x256.png | Whirlwind | Golden circular motion ring and sword afterimages |
| ability-lunge-256x256.png | Lunge | Red-orange straight sword dash and impact flashes along its path |

Each image is exactly **256×256**, RGB PNG with **no alpha channel**. Color and motion fill the whole canvas. Use linear filtering for smooth scaling and preserve square aspect ratio. Layer shortcut labels, cooldown masks, selection/hover frames and disabled states separately in the game UI.

abilities-preview.png shows the exact final 256px PNGs. abilities-scale-test.png shows bilinear reductions to 97, 73, 49 and 37px to assess readability at non-integer display sizes.

Built-in image generation produced original generic sword-action artwork in the approved painterly style. PROMPTS.json preserves prompts and source paths; validation.json records exact dimensions and opacity. The generation masters were resampled to the requested 256×256 exports.
