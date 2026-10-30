# Painterly action icon test — 256×256

Four opaque PNG action icons: Dash, Pack, Build, and Map. They reinterpret the existing pixel-art symbols as painted fantasy UI artwork, with broad highlights, dark painted contours, and a charcoal-purple backdrop.

| File | Action |
| --- | --- |
| action-dash-painterly-256x256.png | Dash: leather boot with pale air-speed trails behind the heel |
| action-pack-painterly-256x256.png | Pack / inventory: leather adventurer backpack |
| action-build-painterly-256x256.png | Build: iron crafting hammer |
| action-map-painterly-256x256.png | Map: painted parchment landscape and river |

All four icon files are exactly **256×256**, RGB PNGs with **no alpha channel**. Artwork and background fill the square. They contain no keyboard labels, text, or button frames.

These are smooth painterly images, so use linear filtering for non-integer display sizes instead of the nearest-neighbor filtering used for the pixel-art set. Keep the aspect ratio square. The dark backdrop is part of each image; UI hover, pressed, disabled, borders, labels and shortcuts can be layered separately by the game.

painterly-actions-preview.png shows all four exact 256px exports. painterly-actions-scale-test.png shows bilinear reductions to 97, 73, 49, and 37 pixels, deliberately avoiding integer multiples of the earlier sprite dimensions. These are static previews; the in-game sampler, screen scaling and compression can affect the final appearance.

Artwork was created with built-in image generation, then resampled to the requested 256×256 deliverable. PROMPTS.json retains the prompt set and source references; validation.json records size, RGB mode, and opacity checks. Previous pixel-art assets are preserved.
