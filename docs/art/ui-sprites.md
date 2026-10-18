# UI sprite kit

Settings → **Sprites** opts into the shared PNG interface and world kit and defaults to off, including saves from before this option existed.
The separate **Turn off board sprites** option also opts out of the new world art.
UI themes and Game themes retain their saved selections.
The default Medieval interface and free Classic interface use the kit; every other owned UI theme overrides its interface frames, icons and cards.
Every non-Classic Game theme overrides world sprites independently of the UI theme, including the portrait and Defend's optional sprites.
Switching back to the default look restores the kit without changing the saved Sprites preference.

## Art contract

Use the [source atlas](../../assets/ui-sprites/source-atlas.png) as the visual reference for additional components.
Keep the shared [27-color palette](../../assets/ui-sprites/palette.ppm), upper-left light, charcoal outlines, stepped corners, restrained brass trim and quiet slate interiors.
Frames are 48 × 24 native pixels with six-pixel edge slices displayed at 2×.
Keep typography and values as live DOM text; never bake labels into an asset.
The native grid is enforced during export with nearest-neighbor sampling, binary alpha, palette remapping and no dithering.
Do not use SVG replacements, gradients, glow, blur or fine texture in this kit.

The runtime components live in `public/assets/ui/frames/`, with sizes and slice widths in `manifest.json`.
There are six button states, panel and dialog frames, an inset field, a progress track, three colored progress fills, a tiling surface, a title banner and a card slot.
`src/ui-sprites.css` applies these components only under `html.ui-sprites`; buttons, dialogs, settings controls, HUD bars and page panels retain their existing interactions.
The shared extension lives in `public/assets/style/`, with its native dimensions in `manifest.json`.
It includes currencies, pickups, controls, four hero directions, every named enemy, forest and Defend structures, Equipment, materials and card faces.
Card names remain live text over the PNG backgrounds.
All 29 card faces have distinct compositions: door requirements, enemy groups and source-to-destination trades remain recognizable without baked lettering.
The [badge atlas](../../assets/game-sprites/badges.png) adds one 24-pixel symbol for each of the 22 badges, a level star and an exchange mark used on trade cards.
Badge tokens use reusable 24 × 24 PNG frames for common, rare and epic rarity; the same symbols appear in the Deck, card marks, hand, details, drag ghosts and draw reveals.
Levels and gate signs stay live text over the sprites, and a missing symbol keeps its original glyph.
The [Goal and utility atlas](../../assets/game-sprites/ui-details.png) adds 24 symbols for unlocks, combat forecasts, archery, notes, Skeleton Key and Shroud.
The [ornament atlas](../../assets/game-sprites/ui-ornaments.png) adds Menu, a wax seal, mastery medallion, Revival, a blank signboard, linked diamonds, a duplicate badge coin and a crown.
These share the 24-pixel grid, palette and transparency contract; range and charged-shot rings use different palette ramps so their faces remain distinct.
Goal status marks, small HUD controls, Deck remove/check buttons and Event locks use the same PNG pairs as the larger controls.
Silver uses its own palette-correct PNG instead of a recolored Gold image, and skill nodes use specific symbols where those previously fell back to generic upgrade art.
Skill-node states use PNG frames over a quiet slate backdrop, and heading dividers use the same linked-diamond ornament.
The [Shrine atlas](../../assets/game-sprites/shrines.png) adds a distinct 24-pixel symbol for all twenty boons, plus the pending-count diamond, drag grip, Auto Pick and ban marks.
`ui/boon-icon.ts` shares those symbols between offers, the taken-boons table, First Boon Choice, bans and ranking; icons stay hidden until loaded and while another UI theme is worn.
Standard and trade-off choices reuse the existing normal and danger PNG frames, while ranked and banned rows use the kit's selected and danger states.
The Shrine bar has a palette-matched tiling fill and the count stays live over a quiet diamond center.
The Overheal bar also uses the existing blue PNG fill in the active kit.
The old SVG and PNG artwork stays available for unloaded images, Sprites off and theme overrides.
All ten biome sets and the forest retain their seeded variations and wall adjacency while sharing a palette-normalized 24-pixel terrain atlas.
Equipment's existing Unique silhouettes and the named enemy roster are preserved during normalization.
Small dressing (plants, cobwebs, pebbles and broken containers) uses 12-pixel PNGs drawn 1:1 inside the same 24-pixel tile grid.
Defend’s [city atlas](../../assets/game-sprites/city.png) adds six roof materials, oak and pine canopies, wall cap and face pieces, rubble, scaffolding, lilies, reeds, lanterns and the city-tile tool icon.
Roofs use 24-pixel panels whose narrow centers repeat to fit the existing house footprints, preserving square pixels and upper-left lighting.
Small city objects and wall caps use 12 pixels, and the wall face is 12 × 6.
The [Defend structure atlas](../../assets/game-sprites/defend-structures.png) replaces the earlier front-facing city structures with overhead buildings at twelve native pixels per simulation cell.
The keep and archer barracks are 36 × 36, the barracks 36 × 48 (48 × 36 for a horizontal fit), and towers 24 × 24; their palette icons retain the same aspect ratios.
The [tower reference](../../assets/game-sprites/defend-towers.png) simplifies the three small towers for their 24-pixel grid, and the [horizontal barracks](../../assets/game-sprites/defend-barracks-wide.png) is separately lit from the upper left.
Roof and wall panels are marked `tile` in the manifest and may be opaque so adjacent pieces join; isolated objects keep transparent padding.
Objects use a 24-pixel native grid; larger structures use 48 pixels, and card faces use 48 × 64.
The source atlases for [icons](../../assets/game-sprites/icons.png), [world objects](../../assets/game-sprites/world.png) and [controls](../../assets/game-sprites/controls.png) remain outside the deployed assets.

## Prompt template

> Create a production sprite atlas for Tower Delve, a medieval dungeon RPG.
> Draw reusable UI backgrounds and control pieces, isolated on transparency, without lettering, icons, scenery or perspective.
> Match the attached source atlas: restrained 1990s dungeon RPG pixel art, consistent coarse pixel grid, one-pixel charcoal outlines, two-pixel bevels, upper-left light and bottom-right shadows.
> Use the attached slate-and-brass palette, with wine red for destructive controls, blue for XP and green for progress.
> Keep centers quiet and flat behind live text; use small brass corner fittings, straight edges and crisp stepped corners.
> No gradients, antialiasing, blur, glow, dithering, noise or painterly detail.
> Produce [specified pieces and states] with identical geometry, aligned in [specified atlas layout] with transparent gutters.

The initial source used a four-column, four-row layout.
Row one contains normal, hover, pressed and selected buttons.
Row two contains disabled and danger buttons, a panel and a dialog.
Row three contains a field, a progress track, a blue fill and a red fill.
Row four contains a green fill, a surface, a banner and a slot.
The [detail atlas](../../assets/game-sprites/details.png) extends the same reference with Equipment actions, rare/epic pendants, a pointing hand, Shop and Deck icons, plants and broken containers.
Image generation establishes the design; measured extraction and palette normalization establish the production pixel grid.

## Export

With ImageMagick installed, run `node tools/prepare-ui-sprites.mjs` from the repository root.
An optional first argument selects a replacement source atlas, but a different layout requires updating the measured crop rectangles.
Source art remains outside `public/` so it is not deployed.
Palette conversion saves and restores the alpha channel explicitly: remapping against an opaque PPM palette otherwise makes transparent backgrounds opaque.
Frame centers are flat slate (brass for the title banner) so stretching does not enlarge stray texture behind live text.
The game needs no image-processing dependency.
For city prompts, specify directly overhead buildings, the exact footprint and twelve native pixels per simulation cell, with no front facade.
For the world and icon extension, run `node --experimental-transform-types tools/prepare-game-sprites.mjs`.
Use `--city-only` to export just the city set and `--structures-only` for the overhead Defend buildings.
Run `node --experimental-transform-types tools/prepare-badge-sprites.mjs` to export the badge symbols and rarity frames before rebuilding card faces.
Use `--details-only` to refresh the sixteen detail sprites, or `--cards-only` after changing frame art or the explicit compositions in `src/sprite-cards.ts`.
Run `node --experimental-transform-types tools/prepare-ui-details.mjs` to extract the Goal, HUD and ornament set from its measured gutters.
Run `node --experimental-transform-types tools/prepare-shrine-sprites.mjs` for the twenty boon and four control symbols plus the repeatable bar fill.
The full game exporter preserves badge, Shrine and UI-detail assets; rerun their own exporter when a source atlas changes.
That exporter also packs the terrain atlas and produces `src/sprite-terrain-index.ts`.
PNG load failures keep the original icon or procedural renderer visible; loaded images invalidate cached terrain and city layers through a shared revision.

Before accepting a replacement, inspect the native-size pieces and compare normal, hover, selected, pressed and disabled states together.
Check phone and desktop layouts, keyboard focus, save/reload, toggling off, erase-progress reset, and short-of-Gems controls remaining actionable.

`tests/sprite-details.test.ts` decodes every shared object/card PNG and checks the palette, binary alpha and transparent padding for isolated objects.
With the dev server running, `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/sprite-browser.mjs` checks real PNG loading, mobile/desktop layouts, save/reload and independent theme overrides, and captures review screenshots under `test-results/sprites/`.

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/city-sprites-browser.mjs` starts its own server and captures Defend at both scales, including damage and rebuilding, then checks identical pixels after switching sprites off.

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/badge-card-sprites-browser.mjs` starts its own server and checks the actual Deck, card marks, draw controls, badge details/reveals and in-run hand at phone and desktop sizes, including live text, fallbacks and independent theme overrides.

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/goals-hud-sprites-browser.mjs` starts its own server and reviews the new art at native size and 2×, then checks actual Goals, skill nodes, HUD controls, live counts, Silver, the dialog seal, theme overrides and failed-image fallback on phone and desktop layouts.

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/shrine-sprites-browser.mjs` checks real offers, picks, live copy counts, first choice, bans, arrow and grip reordering, save/reload, failure fallback and independent theme overrides at phone and desktop sizes.
