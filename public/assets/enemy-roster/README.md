# Enemy artwork

All 126 default enemies use the downward-facing player's elevated front camera.
Show the front of faces and bodies together with the tops of heads, shoulders, shells and backs.
Running and charging creatures still face straight toward the bottom of the screen, with no left/right yaw.
The preview includes the actual player sprite at the same display scale for comparison.
The exporter locates transparent gutters to keep wide wings and shoulder armor intact.

Individual transparent 24 × 24 PNGs live in `../style/` with IDs and padded atlas regions in `atlas.json`.
Regenerate the PNGs, review atlas and preview from the retained source sheets with `node --experimental-transform-types tools/prepare-enemy-sprites.mjs` from the repository root.
Then run `npm run sprites:atlas` to rebuild the runtime atlas.
Names, profiles, traits, strength progression and the Legacy Enemies setting are unchanged.
