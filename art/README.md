# Source art

- `deliveries/` holds each art pack exactly as Jordan delivered it (zips of the painted 256px masters, the
  48/64px pixel icons with their JSON/MD notes, and the Wanderer's Kit desktop UI skin v3).
- Extracted masters live in `icons/paint/src` (painted icons, 256px) and `icons/48`, `icons/64` (pixel icons).
  The game loads `icons/paint/{key}-{64,128,256}.webp`, made from the masters with PIL Lanczos (lossless WebP).
- The UI re-skin brief and its mockup are in `docs/ui-reskin/`; the v3 integration handoff is in
  `docs/ui-reskin/v3/CODING_AGENT_HANDOFF.md`.
