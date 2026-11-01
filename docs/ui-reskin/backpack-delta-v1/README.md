# Wanderer’s Kit — backpack delta v1.1

Revision 1.1 corrects the body to parallel side walls and a constant-width rectangular floor. If v1 is already integrated, replace only the two `backpack-body-normal` PNGs (1x and @2x). Slot, button, icon and mask PNGs and all layout coordinates are unchanged. Depth comes from the leather walls, rolled rim and shadows; do not apply a perspective taper.

Start with `BACKPACK_DELTA_HANDOFF.md`, then `layout.json`. Import the normal PNGs and tint masks from `assets/`. Prefer the @2x set displayed at half intrinsic size; the 1x set is a fallback.

This pack contains only the new recessed body, reusable backpack cell, shared utility button, three symbols, two masks, and instructions. Reuse the existing character folio, bedroll, header, spine, item artwork and gameplay handlers. The inventory remains 4 × 5 slots. The destroy target is a matching horizontal button with a runtime red face tint.

`BACKPACK_DELTA_ASSEMBLED.png` and `BACKPACK_DELTA_PROOF.png` are reference compositions, not runtime textures. They contain live-label examples and use the exact production pieces.

No game code has been changed. Integration and gameplay checks are listed in the handoff.
