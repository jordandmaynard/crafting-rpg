# Flour and sourdough item icons

- flour-bag-48x48.png: open cloth sack containing white flour.
- sourdough-round-loaf-48x48.png: whole baked round sourdough boule.

Each icon is exactly 48×48 including its one-pixel black outer contour. Alpha is binary, 0 or 255. Black is confined to the alpha boundary, with zero interior black pixels and zero solid 2×2 black blocks. Item icons use a readable three-quarter view; the strict 2:1 projection applies only to buildings and stations.

Use nearest-neighbor filtering, whole-pixel placement and integer scales. Preserve alpha and avoid lossy compression or extra outlines. food-preview.png shows the exact final pixels at 4× scale on a review-only background.

Artwork used built-in image generation followed by exact-size pixel cleanup. PROMPTS.json retains the prompt set; validation.json records the checks.
