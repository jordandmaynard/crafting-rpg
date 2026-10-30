# Painterly starter equipment test — 256×256, binary alpha

Four equipment item PNGs matching the starter set's existing shapes, colors and general poses in the approved painterly visual style.

| File | Item |
| --- | --- |
| cloth-shirt-painterly-256x256.png | Blue cloth tunic, green collar, brown belt and brass buckle |
| cloth-pants-painterly-256x256.png | Simple brown cloth trousers |
| cloth-shoes-painterly-256x256.png | Pair of soft brown cloth shoes |
| sword-wood-painterly-256x256.png | Wooden sword with brown wrapped grip |

Each individual image is exactly **256×256**, RGBA PNG. The source alpha channel is **binary: only 0 or 255**. The item is fully opaque and the background fully transparent. Painterly colors and shading remain smooth inside the item; the cutout boundary uses hard alpha. There is no baked background, cast shadow, or single-pixel black-outline requirement.

The four source PNGs preserve 1-bit alpha behavior in an ordinary RGBA format. Texture filtering at display time may interpolate alpha; use the game's desired alpha-cutoff or blending settings. Linear filtering allows non-integer display scales for the painted artwork. Keep square aspect ratio, preserve alpha, and avoid lossy texture compression. No strict 2:1 projection applies to these item icons.

painterly-starter-preview.png composites the final PNGs on a review-only dark backdrop at 256px each. painterly-starter-scale-test.png compares bilinear reductions to 97, 73, 49 and 37px. These two review sheets have opaque backgrounds; the four item PNGs do not.

Artwork used built-in image generation, then exact-size export and binary-alpha cleanup. PROMPTS.json retains prompts and source references; validation.json records the per-file dimensions and alpha values. Earlier pixel-art assets are preserved.
