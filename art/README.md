# Source art

- `deliveries/` holds each art pack exactly as Jordan delivered it (zips of the painted 256px masters, the
  48/64px pixel icons with their JSON/MD notes, and the Wanderer's Kit desktop UI skin v3).
- Extracted masters live in `icons/paint/src` (painted icons, 256px) and `icons/48`, `icons/64` (pixel icons).
  Each icon's cell is `icons/paint/{key}-{128,256}.webp`, made from its master with PIL Lanczos (lossless WebP);
  the game loads them packed into set sheets (`icons/atlas`), built by `tools/atlas.py` from `icons/atlas/atlas.json`
  (since v867; run `python3 tools/atlas.py add <key> <master.png>` then `python3 tools/atlas.py` to replace one).
- The UI re-skin brief and its mockup are in `docs/ui-reskin/`; the v3 integration handoff is in
  `docs/ui-reskin/v3/CODING_AGENT_HANDOFF.md`.
