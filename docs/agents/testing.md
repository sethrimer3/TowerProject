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

The UI and render snapshot suites also accept `PLAYWRIGHT_EXECUTABLE_PATH` for an installed Chromium binary.
`tests/sprite-browser.mjs` uses the dev server to check the real Sprites toggle, save/reload, mobile/desktop layouts, PNG loading and independent UI/Game theme overrides.

`tests/city-sprites-browser.mjs` starts its own Vite server and checks Defend PNGs at normal and zoomed scales, damage/rebuilding and exact pixel restoration after toggling off.

`tests/goals-hud-sprites-browser.mjs` starts its own Vite server for Tower/Delve PNG presentation, with native/2× review art and actual Goals, skill and HUD checks at phone/desktop widths.
It covers independent theme overrides, original-image fallback, live control counts and palette-correct Silver without entering Defend.

`tests/shrine-sprites-browser.mjs` starts its own Vite server for the Shrine PNG subjects, count/choice components and real offer/pick/management actions at phone and desktop widths, including save/reload, PNG grip dragging, independent theme overrides and failed-image fallback.
The UI golden's Shrine fixtures are appended after earlier fixtures so their seeded runs keep the same seeds.

`tests/equipment-sprites-browser.mjs` starts its own Vite server for Equipment's PNG frames and status marks, exercising leveling, both loadouts, selection, assembly, save/reload, actionable Gem shortages, missing-image fallback and independent theme overrides at phone/desktop widths.

`tests/ui-controls-sprites-browser.mjs` starts its own Vite server for real navigation and popup-close clicks on PNG images, native range inputs with keyboard/pointer and save/reload, focus, Overheal fills, reward art, fallbacks and independent theme overrides at phone/desktop widths.
It checks slider variables and actual PNG response loads rather than Chromium's unsupported computed styles for its internal thumb pseudo-element.

`tests/combat-sprites-browser.mjs` starts its own server for native/enlarged PNG art and real combat Renderer frames at phone/desktop widths, complete asset loading, independent theme overrides and exact off/on/off pixel restoration.
The appended `spriteCombat` render scene covers projectiles, shield boundaries, enemy and Target/Ignore/skip marks, live pixel lettering and opened/closed chest stars with Sprites on, without changing earlier scene seeds.

`tests/sprite-layout-browser.mjs` starts its own server and checks actual text/icon bounds inside HUD PNG borders at 320–1100 pixels, open menu controls, large HP/ATK/DEF/Shroud values, phone Training values/controls and actual Settings, Deck and Shop buttons. It checks the real Sprites toggle, local font loading, reload and independent theme overrides.

`tests/sprite-lighting-browser.mjs` compares baked lighting-mask alpha with the actual hero PNG, including a deliberately delayed image, facing changes, highlight clipping and exact toggle restoration before cache expiry.
`tests/sprite-font.test.ts` checks the bundled WOFF2, legacy font strings and font-ready invalidation; `tests/board-marks.test.ts` checks native placement and unloaded/off fallbacks. The render suite explicitly waits for Tower Pixel before capturing kit text.

`tests/card-tree-browser.mjs` starts its own Vite server and opens STAIRS' upgrade tree from the Deck page at phone and desktop widths: that it replaces the page, spending points from the list (phone) and from the tree by mouse, by choosing again and by keyboard (desktop), the arrow keys, the next nodes opening, the branches painted, a respec for Gems and one short of them, back to the Deck, and the tree saved across a reload.

`tests/environment-sprites-browser.mjs` starts its own server, defers one water PNG, and checks literal PNG texels against the real baked pool/depth/bank pixels, unchanged pool/moss coverage, vine leaves staying out of water and immediate cache refresh.
It reviews native/enlarged pieces and repeated materials, real phone/desktop dungeon frames, independent themes, board/decor opt-outs, exact off/on/off restoration, and palette-matched emitted light colors with unchanged light geometry.
`tests/environment-sprites.test.ts` checks native material/plant sizes, distinct variants and exact flower/cap draw anchors; the appended `spriteEnvironment` golden walks a real wet, overgrown room with Sprites on.
