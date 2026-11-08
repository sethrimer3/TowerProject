# Catalog relic artwork

126 unique transparent 24 × 24 PNGs in ../style/, matched to the actual relic IDs, names, rarities, event themes and tower rewards.
Atlas coordinates are in atlas.json, measured in pixels from the top left and excluding two-pixel transparent padding.
preview.html embeds a labeled gallery at 4× native size.
The production build also packs these original files into ../atlases/ui.png.
Use nearest-neighbor sampling at integer scales.

Retained sources and their authored cell order are in assets/game-sprites/relic-sources/.
Regenerate from the repository root with node --experimental-transform-types tools/prepare-relic-sprites.mjs, then npm run sprites:atlas.
No relic IDs, bonuses, ownership or rewards are changed.
