# Test setup details

Browser test setup: the browser channel, seeded saves, fixed clocks, dev-server versus snapshot builds, and how the snapshot suites wait and record.

Browser tests default to installed Microsoft Edge; set `PLAYWRIGHT_CHANNEL=chrome` otherwise.
Screenshots go to `test-results/`.
They seed state by writing the `towerdelve.v1` save into localStorage, and fix the page's clock first (`fixClock` in `tests/fixed-clock.mjs`: Monday noon GMT, as the UI suite starts, timers still running), so what depends on the date, such as the Tournament's phase and its free Ticket's celebration, is the same every day.
`test:browser` and `test:pointer` hit the dev server at `http://127.0.0.1:5173/` (or `TEST_URL`, for one on another port, such as one run from a separate worktree).
The snapshot suites `test:render` and `test:ui` instead build the app with `vite build --mode snapshot` (into `dist-snapshot/`: served from the root, so asset URLs match the dev server's, with the modules the suites import in the page at `/snapshot/render-scenes.js`, `save.js` and `state.js`), and each starts its own `vite preview` of it on the first free port from its own (render 4180, ui 4190; `tests/snapshot-preview.mjs`), so no file change can reload a page mid-run and several worktrees can run them at once.
They pin the streams' start-up seeds (`__pinnedSeeds`) like the Node preload, wait for the page's HTML and a ready element rather than every image, and always close the browser and server and exit, pass or fail.
`test:snapshots` runs both at once, each output line tagged with its suite, and fails if either does; the UI suite takes each snapshot as soon as nothing is moving (no route being walked or fight playing out, from the app's `boardBusy()` debug hook; no finite CSS animation or transition running; no tile highlight fading out) and the HTML is the same on two checks in a row, each after two real animation frames (a busy machine can delay a frame, and the next frame may still change the HTML, such as a canvas it sizes), instead of waiting a fixed time after every step.
The render suite encodes PNGs only for frames that changed (every frame when recording), and draws a scene a second time, to catch nondeterminism, only when recording or when one of its frames no longer matches.
`ONLY=<key prefixes>` or `ONLY=failed` runs part of either suite (`tests/golden-filter.mjs`; see goldens.md).

`npm run test:proving` uses the dev server to exercise both boss entries, the three-control picker, actual tile routes without arrow buttons, hybrid overrides and resume, automatic shared difficulty and one-time Trial Points equal to the cleared difficulty.
It also checks cards-only input authority, reloads, daily key exhaustion/refill, isolated purchases and protection of paused ordinary runs, with picker previews at 320/390/1024 pixels in `test-results/proving-grounds/`.

`tests/default-art-browser.mjs` starts its own Vite server and checks a delayed required sprite, hidden gameplay until decoding completes, a fully painted first board, a dropped image recovering by itself, a failing one reloading twice before Retry, Retry recovery, migration from both retired art flags, persistent independent options and UI/Game theme overrides.
It rejects any requests for the removed bitmap directories and checks every initial DOM image is loaded before reveal.
`tests/sprite-preload.test.ts` verifies the generated inventory covers all deployed images and contains real nonempty PNGs.

The UI suite allows up to 30 seconds for initial artwork decoding before the HUD becomes visible.
The UI and render snapshot suites also accept `PLAYWRIGHT_EXECUTABLE_PATH` for an installed Chromium binary.
`node tests/trial-props.mjs` uses the dev server (or `TEST_URL`) for trial floor-edge props at 320/1024 pixels, an actual canvas-light measurement before/after a torch goes out, beam and slime destruction, reload persistence and isolation from the ordinary Tower run.
It loads seeded saved attempts and steps them with the real manual Wait button; screenshots go to `test-results/proving-grounds-props/`.
`node tests/trial-sprites.mjs` also uses the dev server and verifies real trial PNG draws, literal hero/stairs texels, a deliberately delayed hero image, live Settings toggles with exact pixel restoration, independent theme gates and destruction with the kit enabled.
It captures Sprites-enabled 320/390/1024-pixel previews in `test-results/trial-sprites/`; trial prop review fixtures enable Sprites too.
The appended `spriteOptions` render scene captures square doors and animated torches without changing the existing scene seeds.
The dungeon suite's literal floor/relief checks read the connected Tower paving panel, while the Node suite checks positive/negative coordinate continuity and screen-row orientation across all fifteen frames.
`tests/tower-tier-sprites.test.ts` checks the four new Tower II/III atlas dimensions, fixed selection across biome boundaries, floor under contents, all sixteen wall joins, and exclusion from Delve and legacy rendering.
`tests/tower-tier-sprites-browser.mjs` starts its own server for literal connected floor reconstruction, correct relief texels, corner footprints, flat black cores, atomic late loading, failed-image fallback, real phone/desktop boards, saved tiers, theme gates and exact restoration on a reused renderer.
Its native material and board review images go to `test-results/tower-tiers/`; the appended `spriteTowerTwo` and `spriteTowerThree` scenes add ten board and drawing-call golden frames without moving earlier scene seeds.
`tests/sprite-animations.test.ts` checks native strip sizes, deterministic rare/staggered schedules, idle delay/reset behavior, painter gates and death-frame freezing.
`tests/sprite-animations-browser.mjs` checks literal hero alpha and fixed gear, original rest frames, bubble clipping, native motion, reflection-frame invalidation, route/settings/theme gates, reduced-motion restoration, missing-image fallbacks and the skull emitted by a real lethal fight.
It captures native/enlarged art and phone/desktop board/death review images in `test-results/sprite-animations/`; the appended `spriteAmbient` scene adds five golden frames while `spriteOptions` now includes ambient motion.


`tests/goals-hud-sprites-browser.mjs` starts its own Vite server for Tower/Delve PNG presentation, with native/2× review art and actual Goals, skill and HUD checks at phone/desktop widths.
It covers independent theme overrides, original-image fallback, live control counts and palette-correct Silver.

`tests/shrine-sprites-browser.mjs` starts its own Vite server for the Shrine PNG subjects, count/choice components and real offer/pick/management actions at phone and desktop widths, including save/reload, PNG grip dragging, independent theme overrides and failed-image fallback.
The UI golden's Shrine fixtures are appended after earlier fixtures so their seeded runs keep the same seeds.

`tests/badge-card-sprites-browser.mjs` checks card faces fill their Deck controls at 320, 390 and 1024 pixels without duplicate button or occupied-slot frames, retaining empty-slot frames, keyboard ordering, lesson dimming and upgrade-tree access.
It also exercises live badge levels, gate symbols, reveals, missing-image fallbacks and independent theme overrides.

`tests/equipment-sprites-browser.mjs` starts its own Vite server for Equipment's PNG frames and status marks, exercising leveling, both loadouts, selection, assembly, save/reload, actionable Gem shortages, missing-image fallback and independent theme overrides at phone/desktop widths.

`tests/ui-controls-sprites-browser.mjs` starts its own Vite server for real navigation and popup-close clicks on PNG images, native range inputs with keyboard/pointer and save/reload, focus, Overheal fills, reward art, fallbacks and independent theme overrides at phone/desktop widths.
It checks slider variables and actual PNG response loads rather than Chromium's unsupported computed styles for its internal thumb pseudo-element.

`tests/combat-sprites-browser.mjs` starts its own server for native/enlarged PNG art and real combat Renderer frames at phone/desktop widths, complete asset loading, independent theme overrides and exact off/on/off pixel restoration.
The appended `spriteCombat` render scene covers projectiles, shield boundaries, enemy and Target/Ignore/skip marks, live pixel lettering and opened/closed chest stars with the default pixel-art kit, without changing earlier scene seeds.

`tests/sprite-layout-browser.mjs` starts its own server and checks actual text/icon bounds inside HUD PNG borders at 320–1100 pixels, open menu controls, large HP/ATK/DEF/Shroud values, phone Training values/controls and actual Settings, Deck and Shop buttons.
It also checks a packed HUD with all seven limited-use items, large combat stats and both XP/Shrine progress tracks, asserting the portrait stays beside inventory under full-width vitals and play/pause labels remain whole with the default kit and alternate themes.
It checks the default pixel-art interface, local font loading, reload and independent theme overrides.

`tests/sprite-lighting-browser.mjs` compares baked lighting-mask alpha with the actual hero PNG, including a deliberately delayed image, facing changes, highlight clipping and exact toggle restoration before cache expiry.
`tests/sprite-font.test.ts` checks the bundled WOFF2, legacy font strings and font-ready invalidation; `tests/board-marks.test.ts` checks native placement and unloaded/off fallbacks. The render suite explicitly waits for Tower Pixel before capturing kit text.

`tests/card-tree-browser.mjs` starts its own Vite server and opens STAIRS' upgrade tree from the Deck page at phone and desktop widths: that it replaces the page, spending points from the list (phone) and from the tree by mouse, by choosing again and by keyboard (desktop), the arrow keys, the next nodes opening, the branches painted, a respec for Gems and one short of them, back to the Deck, and the tree saved across a reload.
It first taps a hand card and a deck card on a touch phone: their details open on the tap's release and must stay open through the tap's own click, then close on the next tap.

`tests/card-points-lesson-browser.mjs` starts its own Vite server and plays the card points lesson at phone and desktop widths: the Deck tab's numbered dot and pointing hand in the forest with everything else held, the Deck page's arrows and NEW marks, the lesson's card the only one to press, its tree held open until a point is spent, the closing note, NEW gone once a card is met, and the lesson gone after a reload.
`tests/archives-lesson-browser.mjs` starts its own Vite server and plays the Archives lesson at phone and desktop widths: the Research tab's dot and pointing hand in the Tower's forest with everything else held, the hand under the Research page's Archives tab over the note, the other tabs held until the note is pressed, and a reload after.

`tests/environment-sprites-browser.mjs` starts its own server, defers one water PNG, and checks literal PNG texels against the real baked pool/depth/bank pixels, unchanged pool/moss coverage, vine leaves staying out of water and immediate cache refresh.
It reviews native/enlarged pieces and repeated materials, real phone/desktop dungeon frames, independent themes, decor opt-outs, exact off/on/off restoration, and palette-matched emitted light colors with unchanged light geometry.
`tests/environment-sprites.test.ts` checks native material/plant sizes, distinct variants and exact flower/cap draw anchors; the appended `spriteEnvironment` golden walks a real wet, overgrown room with the default pixel-art kit.

`tests/forest-sprites-browser.mjs` starts its own Vite server for native forest art, real Tower/Delve scenes at phone/desktop widths, independent theme gates, decoration/board opt-outs and exact off/on/off restoration.
It delays a crown PNG to verify the atomic ground/foliage switch, tests failed foliage and landmark images, and taps the real Blacksmith, Tournament Hall, mode sign and both entrances.
`tests/forest-sprites.test.ts` checks native sizes/anchors, seeded placement, unchanged tiles, all seventeen nature silhouettes, multi-tile crowns above understory, road/building/sign clearance and the decoration opt-out.
The appended `spriteForestTower` and `spriteForestDelve` scenes add ten browser and drawing-call golden frames without changing earlier scene seeds.

`tests/dungeon-sprites-browser.mjs` starts its own server for literal floor/relief PNG texels, transparent transition centers, native atlases, delayed/failed material loads and real Tower/Delve interiors at phone/desktop widths.
It changes sprite, board, decoration and independent theme settings on a reused Renderer, verifies exact legacy-pixel restoration and checks that drawing never changes tiles; its monotonically advancing warmup settles the Delve camera and older image caches before comparing frames.
`tests/dungeon-sprites.test.ts` checks atlas dimensions, contiguous stone/earth patches and all sixteen native wall-frame selections across six seeded variants, including the floor under items and doors.
It also checks seeded wall variation, two-ring wall depth and exact opening positions, continuous shade contours across positive/negative tile seams, monotonic straight-wall shading without isolated holes, diagonal locality, convex/concave corner eligibility, world-edge exclusions and material patches staying out of blocking walls.
The browser suite checks six distinct exposed north rims and south-facing facades, flat shared black cores, broad shaded wall bodies, literal native texels in every contour band and fully rendered adjoining Tower/Delve walls without repeated black cutouts or transparent seams.
It also verifies literal material blends, clear blend centers, six-pixel corner bounds and pixel-exact wall scaling at fractional sizes/offsets, then reviews the native sheets.
The appended `spriteDungeonMasonry` and `spriteDungeonCave` golden scenes cover real interior layouts; the existing `spriteCombat` and `spriteEnvironment` frames change only for the intended new ground/relief.

`tests/dungeon-details.test.ts` checks the different Tower/Delve detail atlas sizes, shared two-tile selections at negative coordinates, sparse spacing, all seven masonry variants by broad/thin/sheltered edge masks, and exclusions at missing cells, material joins, corners and deep solids.
`tests/dungeon-details-browser.mjs` starts its own Vite server to check literal detail PNG texels in both halves, clipped shade levels, protected coping, late-image refresh of warmed bakes and exact native-wall fallback after a detail image fails.
It reads each atlas's actual width to validate sparse alpha coverage, clear native gutters and matching shade silhouettes across every motif and biome, and captures `test-results/dungeon-sprites/contextual-details.png` for native/enlarged art and connected-room review.

`node tests/keymaster.mjs` uses the dev server for the second trial's three-control picker, dropped and collected golden keys, free/paid mimic fights, saved key reservation, four delayed door impacts and impact receipts across reloads.
It also verifies independent first-clear progression/rewards in all controls and ordinary-run inventory protection, with 320/390/1024-pixel previews in `test-results/keymaster/`.
The appended `keymaster` render job covers fifteen browser and drawing-call frames without moving existing scene seeds.

Keymaster browser checks also exercise saved ghost teleports, one-tile mimic pursuit and boss retreat on even turns, and ten-turn reformation between door hits.
The `keymaster` render job changes seven existing frames for moving actors/ghosts and appends seven phase/movement frames; the Light Elemental and all earlier jobs stay pinned.

`tests/trial-camera.test.ts` checks smooth trial hero/camera presentation, finite-room and native-pixel bounds, Fast/Off/Reduce motion, room changes and fractional-view click accuracy without mutating a trial.
`node tests/trial-camera.mjs` uses the dev server to exercise actual camera/hero interpolation, clicks mid-glide, live Movement transition/Reduce motion controls, reload persistence and card movement, with 320/390/1024-pixel previews in `test-results/trial-camera/`.
Trial browser tile helpers wait for the displayed room and camera settlement, then use the canvas's actual view rather than assuming the hero is centered.
The appended `trialCamera` render job adds eight frames, and only existing trial motion frames change; other board jobs and save/settings defaults remain unchanged.

`tests/keymaster-arena.test.ts` covers the connected wall clusters, open cardinal approaches, movement/planner authority, mimic detours, legal retreat/teleports and idempotent old-attempt relocation.
The Keymaster browser flow checks literal Tower II floor/cover texels on the live canvas without darkness, retains the Light Elemental's dark treatment, and captures the new room at phone/desktop widths.
Only Keymaster pixel frames change for the lit Tower II room and new geometry; subsequent trial-camera drawing-call hashes also change because the fake canvas IDs follow the new terrain bakes.

All remaining Node tests run through `npm test`; there are no separate city-defense or pointer suites.
The board render scenes retain historical seed gaps so removing dormant scenes does not change the Tower/Delve/trial fixtures.
The mode-tab browser flow checks the removed page stays absent even with Legacy owned and in Dev mode, while old-save tests verify discarded city data cannot affect retained progress.

`node tests/upgrade-tabs.mjs` checks that only Inspiration and Breakthrough appear, including in Dev mode and old saves with Legacy unlocked, with single-line text, unclipped icons/points, both selections and usable map space at phone/tablet/desktop and short landscape sizes.
It also checks normal balances and Classic, Medieval, Desktop and Terminal UI themes, with review images in `test-results/upgrade-tabs/`.

After `vite build --mode snapshot` (also built by `npm run test:ui`), `node tests/equipment-recipes.mjs` serves that built game and checks the five-slot plus on narrow phones, four resource balances, actual crafting and equipping, locked acquisition pools, a preserved Cape's position/paired recipe, and decoded native shield sprites.
Its screenshots are in `test-results/equipment-recipes/`; model coverage is in `tests/equipment-recipes.test.ts`.
Shield pixel icons can be exported alone with `node --experimental-transform-types tools/prepare-game-sprites.mjs --equipment-only=shield,wardensShield,bulwarkShield,dawnShield`, leaving existing sprites untouched.
The UI golden tour and upgrade-tree browser checks wait for the startup artwork/font loader to finish before checking the HUD, allowing two minutes for that preload on a busy machine.
The UI golden tour allows 30 seconds for browser interactions so a busy renderer does not fail an otherwise visible control's layout check.

`node tests/deck-swipes.mjs` starts its own Vite server and checks real touch swipes, arrowed card details, second-tap trees, exclusive hand/reserve ownership, finite transfer/gap animations, full-hand refusal sound/shake, cancelled touches, keyboard equivalents, Manual hand, reduced motion and save/reload.
Its phone/desktop screenshots are in `test-results/deck-swipes/`.
