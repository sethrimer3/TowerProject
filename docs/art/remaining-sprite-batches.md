# Remaining sprite batches

Six generated source sheets cover five work groups and 100 native assets.
The sources live in `assets/game-sprites/remaining-sources/` and the native exports in `assets/game-sprites/remaining-native/`.
The 56 Arcana/HUD and theme assets are deployed through `tools/install-interface-sprites.mjs`.
Their SVG UI branches, embedded CSS vectors and linked theme decorations have been replaced in the game.
The 44 actor and effects assets remain prepared for a separate world-renderer integration.

| Work group | Sheet | Count | Native size |
|---|---|---:|---|
| Arcana and HUD | arcana-hud | 16 | 24 × 24 icons; 12 × 12 small controls |
| Proving Grounds | trial-actors | 12 | 24 × 24 |
| Spell effects | spell-effects | 16 | 24 × 24 |
| Environment and marks | environment-effects | 16 | 24 × 24 |
| Themes | theme-details | 16 | 48 × 48, or 48 × 24 for dividers/connectors |
| Themes | theme-frames | 24 | 48 × 24, six-pixel slices |

All native PNGs use the shared 27-color palette, binary alpha, nearest-neighbor sampling, upper-left highlights and hard color steps.
Frame centers are flattened explicitly during export so stretching cannot magnify texture.
No lettering is baked into art.
The source sheets are design inputs; only the native exports satisfy the enforced palette and alpha contract.
Regenerate with `node tools/prepare-remaining-sprites.mjs` and check with `node tools/check-remaining-sprites.mjs`.

## Reuse existing art

Currencies, Arcanite (`shard`), Equipment items/materials/actions, Goal icons, badge stars, tutorial pointers, menu controls, copy buttons, Event locks, small checks and navigation already have native PNGs under `public/assets/style/`.
The existing shared frames cover the default interface and need no duplicate generation.
Their retained SVG branches now use these existing PNGs across UI themes.
Keep live letters, numbers and labels as text.

## Integration notes

Arcana icons have separate identifiers from their combat effects.
Light Slime and Door Spirit supplement the ten principal Proving Grounds subjects, bringing that sheet to twelve.
The ripple frames deliberately grow from six to twenty-two pixels; do not normalize their visible footprints to the same size.
Grass frames share a 24-pixel canvas but require animation registration at their base before deployment.
Spell fields are single authored effect frames, not complete animation strips.
Connectors supply a visual reference and raster pieces; skill-tree paths still need layout-aware pixel drawing or raster composition, including their hidden-node treatment.
Surface textures are swatches, not verified seamless tiles.
Theme backgrounds should preserve sparse placement and contrast rather than scaling a small icon to cover the page.
Theme frame states require in-context nine-slice review and matched corner geometry before deployment.
The 48-pixel theme ornaments need separate native exports if used in tiny controls.
World-renderer changes and effect animation timing remain separate integration work.
The interface migration is covered at phone and desktop sizes across all 17 UI themes by `tests/png-interface.mjs`.
