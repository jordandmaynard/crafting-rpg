# Wanderer's Kit — wooden crate window

Production assets for the approved open-crate storage window, with ten compartments in a 5×2 grid.

- `assets/`: normal frame, separate close button and reusable well tint mask, each at 1× and 2×.
- `layout.json`: exact 840×480 logical placement and tint values.
- `CRATE_CODING_AGENT_HANDOFF.md`: integration, scaling, interaction and current-implementation differences.
- `integration/`: reference DOM adapter and CSS; connect to the game’s existing storage logic.
- `demo/index.html`: local preview with optional sample contents and tint-state examples.
- `previews/`: final-art placement and asset proofs, not game textures.
- `source/`: blank master; `generation-prompt.txt` retains the built-in image edit directions.

The frame already contains the ten normal compartment artworks. Add live item/count/hit layers, not another inventory slot texture. Use tints for interaction states. Assets have been visually and structurally checked; the adapter passed syntax checking and still requires browser/in-game wiring and QA.
