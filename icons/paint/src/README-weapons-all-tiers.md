# Painterly weapon progression — 256px binary alpha

40 inventory equipment icons: sword, bow, spear, axe and hammer across eight tiers.

Wood → Bone → Copper → Iron → Verdane → Caerite → Orivane → Auralith

## Files

`icons/` contains forty individual 256 × 256 RGBA PNGs. Every alpha channel contains only 0 and 255. RGB in fully transparent pixels is cleared to zero. Colored shading, metallic reflections and material detail remain painted into fully opaque object pixels.

Names follow `<weapon>-<material>-painterly-256x256.png`. `manifest.json` lists every filename, tier, bounding box and hash. The five established wood icons are the starting designs; the 35 higher-tier icons are newly generated. This pack adds the full progression to axe and hammer as well as sword, bow and spear.

## Design progression

| Tier | Material and construction |
| --- | --- |
| 1 — Wood | Warm carved wood, plain shapes, simple wrapped grips |
| 2 — Bone | Ivory carving, organic ridges, rawhide bindings |
| 3 — Copper | Copper-red forged parts, simple rivets and reinforcement |
| 4 — Iron | Cool white-silver metal, stronger bevels and fitted reinforcement |
| 5 — Verdane | Jade/emerald metal, leaflike forms, brass accents and green gems |
| 6 — Caerite | Cobalt/sapphire metal, icy silver fittings and sharper angular details |
| 7 — Orivane | Violet/amethyst, sculpted layered fittings and intimidating profiles |
| 8 — Auralith | Prismatic abalone-like teal, blue, violet, pink and pearl metal with elaborate platinum fittings |

Auralith uses the current prismatic material; it replaces the historical orange/gold appearance. Iridescence and gemstones are opaque paint, with no translucent aura. Each weapon keeps its lower-left grip/butt to upper-right head/tip arrangement. Hammers retain the large block head; axes have a single cutting blade; bows are strung with no arrow.

## Import / coding handoff

- Use these as inventory, equipment, crafting recipe and tooltip item textures. They are separate from the opaque blue/gold/red ability action icons.
- Preserve 1:1 canvas aspect ratio, RGBA and sRGB sampling. Do not trim each image differently at runtime or stretch it to fit a slot.
- Each new object is fitted within a roughly 232px square on its 256px canvas. Original wood art retains its established scale. These are icon-scale comparisons, not physical weapon-length measurements.
- Use lossless UI texture settings or an alpha-preserving format. Do not flatten onto a background. Avoid lossy settings that introduce colored edge fringes.
- Source alpha is binary. If the renderer requires hard coverage at all scales, use alpha test/cutoff at 0.5 after sampling; bilinear filtering or mipmap generation can otherwise introduce intermediate alpha during rendering.
- Keep item counts, names, keybindings, slot frames, hover/selected tints and availability feedback in live UI layers.
- `previews/` is review material only, not game textures. The matrix shows all tiers, family strips show actual 256px icons, and light/dark proofs show actual 64px and 32px hard-alpha downsamples.

`alpha-validation.json` records export checks. `generation-prompts.json` records the exact art directions and identifies the reused wood baselines. New artwork used the built-in image generator; export processing crops, scales, cleans tiny detached source specks and thresholds alpha at 128.
