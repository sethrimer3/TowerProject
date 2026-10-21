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
Frames are 48 × 24 native pixels with six-pixel edge slices. Ordinary buttons display a six-pixel edge and compact controls a three-pixel edge; reserve that same width as a real border so trim never covers labels or icons. Larger panels can display the slices at 2×.
Keep typography and values as live DOM or Canvas text; never bake labels into an asset. The active kit uses the original local Tower Pixel face, with editable square-pixel matrices, distinct lowercase and tabular digits; UI and Game themes gate it independently, excluding Defend.
The native grid is enforced during export with nearest-neighbor sampling, binary alpha, palette remapping and no dithering.
Do not use SVG replacements, gradients, glow, blur or fine texture in this kit.

The runtime components live in `public/assets/ui/frames/`, with sizes and slice widths in `manifest.json`.
There are six button states, panel and dialog frames, an inset field, a progress track, three colored progress fills, a tiling surface, a title banner and a card slot.
`src/ui-sprites.css` applies these components only under `html.ui-sprites`; buttons, dialogs, settings controls, HUD bars and page panels retain their existing interactions.
The shared extension lives in `public/assets/style/`, with its native dimensions in `manifest.json`.
It includes currencies, pickups, controls, four hero directions, every named enemy, forest and Defend structures, Equipment, materials and card faces.
Card names remain live text over the PNG backgrounds.
The card face supplies the only frame on occupied Deck cards, filling its button without an extra button skin or hand-slot frame; empty and purchasable slots keep the inset slot PNG.
All 29 card faces have distinct compositions: door requirements, enemy groups and source-to-destination trades remain recognizable without baked lettering.
The [badge atlas](../../assets/game-sprites/badges.png) adds one 24-pixel symbol for each of the 22 badges, a level star and an exchange mark used on trade cards.
Badge tokens use reusable 24 × 24 PNG frames for common, rare and epic rarity; the same symbols appear in the Deck, card marks, hand, details, drag ghosts and draw reveals.
Levels and gate signs stay live text over the sprites, and a missing symbol keeps its original glyph.
The [Goal and utility atlas](../../assets/game-sprites/ui-details.png) adds 24 symbols for unlocks, combat forecasts, archery, notes, Skeleton Key and Shroud.
The [ornament atlas](../../assets/game-sprites/ui-ornaments.png) adds Menu (its open-state X, `ui-menu-close`, is drawn separately in the same palette by `tools/prepare-menu-close.mjs`), a wax seal, mastery medallion, Revival, a blank signboard, linked diamonds, a duplicate badge coin and a crown.
These share the 24-pixel grid, palette and transparency contract; range and charged-shot rings use different palette ramps so their faces remain distinct.
Goal status marks, small HUD controls, Deck remove/check buttons and Event locks use the same PNG pairs as the larger controls.
Silver uses its own palette-correct PNG instead of a recolored Gold image, and skill nodes use specific symbols where those previously fell back to generic upgrade art.
Skill-node states use PNG frames over a quiet slate backdrop, and heading dividers use the same linked-diamond ornament.
The [Shrine atlas](../../assets/game-sprites/shrines.png) adds a distinct 24-pixel symbol for all twenty boons, plus the pending-count diamond, drag grip, Auto Pick and ban marks.
`ui/boon-icon.ts` shares those symbols between offers, the taken-boons table, First Boon Choice, bans and ranking; icons stay hidden until loaded and while another UI theme is worn.
Standard and trade-off choices reuse the existing normal and danger PNG frames, while ranked and banned rows use the kit's selected and danger states.
The Shrine bar has a palette-matched tiling fill and the count stays live over a quiet diamond center.
The Overheal bar also uses the existing blue PNG fill in the active kit.
The [Equipment UI atlas](../../assets/game-sprites/equipment-ui.png) supplies Common, Uncommon, Rare and empty-slot frames plus transparent selection corners at 24 pixels, and worn, Unique and salvage marks at 12 pixels.
Inventory, loadouts, item details, Auto-assemble and result screens share those frames; item art stays at 24 pixels while rarity letters and levels remain live text.
The loadout and assemble trays reuse the existing panel PNG, and Auto-salvage uses the shared field and check PNGs.
The [small-control atlas](../../assets/game-sprites/ui-controls.png) adds native 12-pixel close, navigation, check, lock, ranking and swap marks, a 24-pixel reward star, two 24-pixel slider thumbs and a 48 × 12 track.
`ui/control-icon.ts` shares load-aware icon pairs across page navigation, dialog closes, Mail, settings, Equipment and Shrine controls; larger controls retain their own native art.
The slider PNGs skin the original range inputs, preserving keyboard and pointer behavior and live values in Settings and badge thresholds.
Gold-bonus and enemy-odds popups reuse the dialog frame, heal previews use a pale blue PNG fill, and pending damage reuses the purple Shrine fill, including Overheal.
The [combat atlas](../../assets/game-sprites/combat.png) and [fine-grid shield source](../../assets/game-sprites/combat-shield.png) add 27 native PNGs for arrows, enemy shots, rank and trait marks, chest stars and hollow shield boundaries.
Normal and blue charged arrows have eight exported facings on a 16-pixel canvas, preserving crisp edges while flight positions remain continuous.
Enemy marks use small native footprints inside the 24-pixel tile grid; Supply and Equipment Chests keep one blue star and two purple stars after opening.
Shield boundaries use 48-, 96- and 144-pixel versions selected by the bubble's native diameter, with the existing radius and Delve wrapping preserved.
The [board-mark atlas](../../assets/game-sprites/board-marks.png) adds a blue Target reticle and red Ignore ring at 16 pixels, plus purple skipped and red blocked X marks at 12 pixels. They use the same native density inside the 24-pixel tile grid.
Torch shadows and highlights follow the active PNG silhouettes, hero direction and late image loads.
The [environment atlas](../../assets/game-sprites/environment.png) adds sixteen components: green, teal and wall moss; deep, middle, shore and bank water; four flower hues; two small vine leaf modules; and three glowing mushroom clusters.
Material tiles are 24 × 24, flowers and vine leaves 8 × 8, and glowing caps 12 × 12, with binary alpha and nearest-neighbor sampling.
Moss stays within its shared green/teal palette ramps; water materials are opaque tiles sampled through the exact existing pool and shore masks.
Vine leaves attach to the existing stem joints at native size, clipped to their planned tile and out of water.
The seed still determines coverage and placement, and the flowers/caps retain runtime lighting rather than baked glow.
The [forest nature atlas](../../assets/game-sprites/forest-nature.png) supplies twenty components: five multi-tile crowns (oak, elder oak, birch and two pines), young pine, sapling, shrub, berry bush, fern, two boulders, log, stump, flowers, mushrooms, pebbles and three quiet ground tiles.
Crowns contain 48–96 native pixels across; small objects use 12–36 pixels, all on the same 24-pixel world tile grid and drawn at native density.
Use a steep top-down angle showing crown tops and a short south-facing trunk, upper-left light and restrained green clusters; larger trees receive more pixels instead of enlarging an icon.
The [forest landmark atlas](../../assets/game-sprites/forest-landmarks.png) supplies a 216 × 216 Tower base and a 360 × 240 mountain base, each cropped across the top with no roof, crown or peak.
Show only the monumental lower entrance facade: the tower's stepped threshold and mountain's south-facing cave meet the existing path, with live tier text above them.
Nature objects use binary-alpha silhouettes and quiet green ramps; ground tiles use two-color green or brown ramps, and the tower/mountain use the shared slate ramp.
The forest loads its materials and foliage together before removing the older baked tile trees, and the larger crowns render above smaller foliage while paths, buildings and the sign stay clear.
The old SVG and PNG artwork stays available for unloaded images, Sprites off and theme overrides.
Tower interiors use native fitted masonry floors and connected walls; Delve uses rough bedrock and compact earth for both floors and walls, with coordinate-hashed contiguous material patches.
The [dungeon material source](../../assets/game-sprites/dungeon-materials.png) supplies four floor variations, wall-top variations, south-facing facade strips and coping for each material, plus stepped soil/contact strips.
Twenty-one 96 × 720 deployed PNG atlases hold four floors, six variations of sixteen wall-neighbor frames, four corners, six full tops, six dark tops and four reserved core frames each.
One shared 96 × 216 PNG retains sixteen soil borders, sixteen floor-contact masks and four diagonal soil corners.
Two shared atlases add eighty material masks and sixteen infill/core frames, for 2,652 base and transition frames.
The [wall variation source](../../assets/game-sprites/dungeon-wall-variations.png) supplies six distinct top/facade pairs per material: broad fitted masonry, continuous bedrock with sparse fractures and layered earth with embedded stones.
Keep bedrock surfaces continuous and quiet rather than outlining every stone as separate cobbles; top and south-facing facade variations share a seed choice and fixed lighting.
Exposed wall tops use restricted muted ramps (two slate tones for bedrock, three for masonry/earth), while the south-facing facades keep deeper shading for clear height.
The [corner source](../../assets/game-sprites/dungeon-corners.png) supplies northwest, northeast, southeast and southwest masonry, stone and earth corner insets, plus four flat soil corner patches.
Corner pieces occupy six native pixels at the corresponding tile corner and retain upper-left lighting in every orientation; wall tops vary by seed without rotating or stretching the artwork.
Ten palette ramps retain each masonry and rock biome's identity, while earth keeps its brown ramp; slate and earth extraction use restricted material palettes to avoid stray green or red noise.
Use axis-aligned 24-pixel tiles seen at a steep top-down angle, visible wall tops, shallow three-pixel north/side lips and eight-pixel south-facing wall facades; no isometric diamonds or vanishing points.
Connected walls hide shared edges, and floor centers remain quiet and flat beneath items; soil borders have stepped binary transparency and contact shadows stay inside the floor tile.
The [material blend source](../../assets/game-sprites/dungeon-material-blends.png) supplies the original infill references and four stepped transition silhouettes.
The [wall shading source](../../assets/game-sprites/dungeon-wall-shading.png) is retained as reference; its repeated directional cutout stamps are replaced by continuous contours cut from the original wall textures.
Shade boundaries follow distance to real open tiles in world space, using two-pixel clusters and small variations over 48-pixel cells; neighboring tiles must never restart the shadow pattern.
Full PNG top textures recede through three hard palette levels at approximately 14, 28 and 42 pixels from air, then meet the flat black core; preserve broad walls without repeating holes, isolated fragments or illuminated whole edges from one diagonal opening.
Coping and facades remain independent of inward shading, and every shade level uses literal PNG texels through binary clipping, without blur or interpolated colors.
Compose the complete wall at native resolution before scaling it once with nearest-neighbor sampling; never clip separate shade bands after a fractional display transform.
The [Celeste tileset analysis](https://aran.ink/posts/celeste-tilesets) informed the edge/padding/core treatment: material detail hugs exposed surfaces, shaded material bridges the inward edge, and deep solids share one flat near-black fill.
Our original PNGs retain the angled top-down perspective and native 24-pixel grid; wall depth follows actual open tiles across all materials.
Earth overlaps stone through binary PNG masks on floors and exposed walls, replacing square material seams without blur, dithering or a rim between connected walls.
The shared core is the existing palette color `#0c1016`, fixed across materials and biome ramps; do not texture deep cores or cover them with moss.
The [original contextual detail source](../../assets/game-sprites/dungeon-details.png) adds four 48 × 24 motifs each for masonry, bedrock and earth: worn joints/chips, branching fractures/mineral seams and embedded roots/strata.
The [Tower masonry extension](../../assets/game-sprites/tower-masonry-details.png) adds repaired mortar joints, spalled flakes and worn chisel grooves, selected for broad edges, thin strips and sheltered faces respectively.
The ten Tower detail atlases are 336 × 48 with seven motifs; the eleven Delve detail atlases remain 192 × 48 with four motifs.
All motifs retain the same 48 × 24 native footprint and two palette shades; hard alpha removes the source glow, and every motif retains two clear border pixels.
The [Celeste tileset format reference](https://github.com/EverestAPI/Resources/wiki/Tileset-Format-Reference) documents 3 × 3 neighborhood masks, lists of variants, padding/center layers and optional overlapping tile sprites.
Our application uses original static marks on the 24-pixel angled grid: choose details by edge context, share one motif across two tiles, leave most wall tiles unmarked and never rotate authored lighting.
Use small chips on thin strips and longer joints on compatible broad surfaces; reject material boundaries, missing terrain and incompatible corners rather than cutting a feature in half.
Clip marks to exposed and body shades before coping/facades, and leave the deepest shaded band and core untextured.
The older palette-normalized terrain atlas remains a complete loading fallback; Sprites off and other Game themes keep their original artwork.
Equipment's existing Unique silhouettes and the named enemy roster are preserved during normalization.
Small dressing (plants, cobwebs, pebbles and broken containers) uses 12-pixel PNGs drawn 1:1 inside the same 24-pixel tile grid.
Defend’s [city atlas](../../assets/game-sprites/city.png) adds six roof materials, oak and pine canopies, wall cap and face pieces, rubble, scaffolding, lilies, reeds, lanterns and the city-tile tool icon.
Roofs use 24-pixel panels whose narrow centers repeat to fit the existing house footprints, preserving square pixels and upper-left lighting.
Small city objects and wall caps use 12 pixels, and the wall face is 12 × 6.
The [Defend structure atlas](../../assets/game-sprites/defend-structures.png) replaces the earlier front-facing city structures with overhead buildings at twelve native pixels per simulation cell.
The keep and archer barracks are 36 × 36, the barracks 36 × 48 (48 × 36 for a horizontal fit), and towers 24 × 24; their palette icons retain the same aspect ratios.
The [tower reference](../../assets/game-sprites/defend-towers.png) simplifies the three small towers for their 24-pixel grid, and the [horizontal barracks](../../assets/game-sprites/defend-barracks-wide.png) is separately lit from the upper left.
Roof and wall panels are marked `tile` in the manifest and may be opaque so adjacent pieces join; isolated objects keep transparent padding.
Ordinary objects use a 24-pixel native grid; structure icons use 48 pixels, forest crowns and entrance bases use the larger native dimensions above, and card faces use 48 × 64.
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
Run `node --experimental-transform-types tools/prepare-equipment-ui.mjs` for the five Equipment frames and three status marks.
Run `node --experimental-transform-types tools/prepare-ui-controls.mjs` for the small controls, slider components and pale gain fill.
Run `node --experimental-transform-types tools/prepare-combat-sprites.mjs` for the directional projectile, mark, chest-star and shield set.
Run `node --experimental-transform-types tools/prepare-board-marks.mjs` for Target, Ignore, skipped and blocked marks.
Run `node --experimental-transform-types tools/prepare-environment-sprites.mjs` for moss, water, vine leaves, flowers and glowing cap variants.
Run `node --experimental-transform-types tools/prepare-forest-sprites.mjs` for the twenty forest materials/objects and two enormous entrance bases; measured crops, binary alpha and palette normalization reproduce the deployed PNGs.
Run `node --experimental-transform-types tools/prepare-dungeon-sprites.mjs` for the interior material atlases, all six connected-wall variants, full top/shade textures, ragged material masks, dark core, and the cardinal/diagonal corner and contact pieces.
Run `node --experimental-transform-types tools/prepare-dungeon-details.mjs` for the sparse paired wall motifs in matching biome ramps; the two dungeon exporters share `tools/dungeon-palette.mjs`.
Regenerate the original font with `python tools/prepare-pixel-font.py` using FontTools with WOFF2 support (`fonttools[woff]`); no font-building dependency is needed at runtime.
The full game exporter preserves ambient-animation, dungeon, forest, environment, combat, badge, Shrine, Equipment UI and UI-detail assets; rerun their own exporter when a source atlas changes.
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

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/equipment-sprites-browser.mjs` checks the actual Equipment inventory, both loadouts, selection, leveling, assembly, saved Auto-salvage, actionable Gem shortages and theme/fallback behavior at phone and desktop sizes.

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/ui-controls-sprites-browser.mjs` checks actual PNG navigation and popup closes, range input keyboard/pointer interaction and persistence, focused controls, Overheal textures, reward art, fallback and independent themes at phone/desktop widths.

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/combat-sprites-browser.mjs` checks native/enlarged art and real combat frames at phone/desktop sizes, complete PNG loading, independent theme overrides and exact restoration after switching Sprites off.

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/sprite-layout-browser.mjs` checks that live lettering and PNG icons stay inside button trim, including narrow HUDs, menu buttons, large stats, Training, Settings, Deck and Shop.

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/sprite-lighting-browser.mjs` checks actual hero PNG alpha against shadows/highlights through loads, facing changes and toggles.

`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node tests/environment-sprites-browser.mjs` checks literal material pixels, exact coverage, delayed loads, native/tiled review art, emitted colors, real dungeon frames and independent theme/toggle behavior.

The [square-door source](../../assets/game-sprites/square-doors.png) supplies six 24 × 24 opaque doors: yellow, blue, red, steel, wood and heart.
The [torch animation source](../../assets/game-sprites/torch-animation.png) supplies four flame frames packed into a 96 × 24 strip, with the original torch hardware restored identically below row 11.
The [ambient effect source](../../assets/game-sprites/ambient-effects.png) supplies four tiny bubble clusters and four restrained glints, packed with an empty resting frame into two 120 × 24 overlays.
Bubble texels stay inside both original bottle silhouettes; key shines use only a one- to five-pixel mark near the bow, with long coordinate-phased rests.
The [hero idle source](../../assets/game-sprites/hero-idle.png) supplies four frames per facing; registered differences apply only inside the original torso or inner cape, preserving original frame zero, head, gear, feet and alpha exactly.
The [death source](../../assets/game-sprites/death-skull.png) supplies six skull-and-crossbones frames packed into a 144 × 24 strip with transparent padding, binary alpha and no baked halo.
Run `node tools/prepare-ambient-sprites.mjs` to reproduce all seven strips at native density in the shared palette.
Run `node --experimental-transform-types tools/prepare-sprite-options.mjs` to reproduce these palette-matched, binary-alpha PNGs.
The [Tower floor source](../../assets/game-sprites/tower-floor.png) supplies one connected paving field combining large and small rectangular bricks, exported into ten 96 × 96 biome panels by `node tools/prepare-tower-floors.mjs`.
The sixteen native frames retain their spatial relationship across tile boundaries, including under doors and pickups; the shared material palette and upper-left lighting stay fixed.
The [Tower II material source](../../assets/game-sprites/tower-2-materials.png) supplies limestone ashlar, rectangular paving, south-facing facades and coping.
The [Tower III material source](../../assets/game-sprites/tower-3-materials.png) supplies vertical basalt masonry, octagonal paving with square insets, facades and coping.
Run `node tools/prepare-tower-tier-sprites.mjs` to export one 96 × 96 floor panel and one 96 × 720 connected-wall atlas for each tower, with one fixed palette per set rather than biome recolors.
Both use the shared native corner silhouettes, original upper-left light, three wall shade levels and flat black interior cores; visible texels come from the new sources.
`tests/sprite-options-browser.mjs` starts its own server to check real Settings visibility, focus, persistence, phone/desktop layout, door coverage, stationary torch hardware, frame animation, reduced motion, live renderer restoration, theme gates and failed-image fallback.

## Remaining sprite work

Excluding Defend and custom themes, live water ripples/glints, falling drops, wet-foot overlays, moving tall grass and some wall-corner overlays still use procedural pixels.
Reveal rays, celebration/skill particles and the Equipment melt still use procedural or older icon art.
The board route and badge annotations also retain procedural marks; letters should remain live text.
These are separate from the older PNGs and SVGs deliberately retained for Sprites off and theme fallbacks.
