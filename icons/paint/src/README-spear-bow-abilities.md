# Painterly spear and bow abilities — 256×256

Six full-frame opaque RGB PNGs with blocky weapons and painterly lighting. No labels, key bindings or button frames are baked into the individual icons.

| File | Ability | Visual cue |
| --- | --- | --- |
| ability-spear-thrust-256x256.png | Spear Thrust | One spear thrust forward with blue-white straight trails |
| ability-spear-flurry-256x256.png | Flurry | Main spear and four afterimages in a forward cone with golden yellow trails |
| ability-spear-harpoon-256x256.png | Harpoon | Spear thrown horizontally rightward with chain attached to its rear |
| ability-bow-shoot-256x256.png | Basic Shoot | One released arrow, bow, blue cuboid arm, blue trails |
| ability-bow-volley-256x256.png | Volley | Exactly five arrows spreading horizontally in a forward fan with yellow energy |
| ability-bow-rain-256x256.png | Rain of Arrows | Exactly ten descending arrows, five foreground and five background, over a red circular ground area |

Ability color coding: basic attacks (Thrust and Basic Shoot) are blue; first abilities (Flurry and Volley) are yellow; second abilities (Harpoon and Rain of Arrows) are red. Flurry and Volley match Whirlwind’s warm gold/amber light and purple-indigo shadows. Rain of Arrows matches the red backdrop and orange-gold highlights of Lunge and Harpoon. Harpoon artwork is retained unchanged.

Each icon is exactly 256×256 pixels with no alpha channel. Preserve square aspect ratio and use linear filtering for smooth scaling at non-integer sizes. Add cooldown masks, shortcuts, hover frames and disabled states separately in the game UI. These painterly ability icons do not use the original 48px pixel-art outline rules.

spear-bow-abilities-preview.png displays the six final exports at native size. spear-bow-abilities-scale-test.png compares them at 97, 73, 49 and 37px with bilinear scaling. The sheets are review aids, not sprite atlases.

Created with built-in image generation using the approved blocky painterly Lunge and weapon references. Flurry also uses the supplied in-game reference. Generation masters were resampled with Lanczos to the requested 256×256 exports. PROMPTS.json records prompts and source paths; validation.json records export checks and visually checked arrow counts.
