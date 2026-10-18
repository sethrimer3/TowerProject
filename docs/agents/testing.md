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
