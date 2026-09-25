# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, etc.) when working with code in this repository.

## Project

TowerIncramental: a mobile-first incremental dungeon RPG in TypeScript + Vite. No backend, no game engine, no framework. Canvas draws the board; the DOM (built as HTML template strings in `src/ui/`) provides controls, stats, and pages. All state persists in `localStorage`.

## Commands

Requires Node 22.18+ (CI uses 24). Tests and tools run `.ts` files directly via `node --experimental-transform-types` (no build step; the experimental warning is expected).

```sh
npm run dev            # Vite on 127.0.0.1:5173 (PORT env overrides)
npm run build          # tsc --noEmit && vite build -> dist/
npm test               # all tests/*.test.ts via node:test
node --experimental-transform-types --test tests/defend.test.ts                          # one file
node --experimental-transform-types --test --test-name-pattern="gold formula" tests/*.test.ts  # one test
npm run test:browser   # Playwright suites (tests/*.mjs); needs `npm run dev` running in another terminal
npm run test:render    # board screenshot hashes vs tests/fixtures/render.golden.json (also needs `npm run dev`)
npm run test:ui        # page/HUD/dialog HTML hashes vs tests/fixtures/ui.golden.json (also needs `npm run dev`)
npm run tower:report -- [seed depth]    # Tower floor generation audit (no args = aggregate over many floors)
npm run delve:report -- [seed] [area] [--map]
node --experimental-transform-types tools/delve-ai-sim.ts   # headless Automove comparison
npm run tiles:area1 / tiles:outside     # regenerate tile PNGs
```

- Browser tests default to installed Microsoft Edge; set `PLAYWRIGHT_CHANNEL=chrome` otherwise. Screenshots go to `test-results/`. They hit `http://127.0.0.1:5173/` and seed state by writing the `towerincramental.v1` save into localStorage.
- Source imports use explicit `.ts` extensions (`allowImportingTsExtensions`) — required so Node can run them directly. Keep this in new imports.
- `tsconfig` only includes `src/`; tests and tools are not type-checked by `npm run build`.
- CI (`.github/workflows/static.yml`) runs `npm test` and `npm run build` on push to `main`, then deploys `dist/` to GitHub Pages. Vite `base: "./"` keeps asset paths relative — asset URLs must not be root-absolute (a test enforces this).

## Architecture

**Modes.** Tabs switch between `tower`, `delve` (unlocked by upgrade), and `defend` (unlocked by the `legacy` upgrade). Tower and Delve share one `Game` (`src/state.ts`: movement, pickups, doors, run lifecycle, purchases) and `Renderer` (`src/rendering.ts`). `game.mode` selects which `save[mode]` slice (run, undo history, revival, bests, looted tiles) is active. A run may also be `outside` (`src/outside.ts`), the forest clearing before entering. Defend is a separate self-contained system in `src/defend/` with its own save sub-object (`save.defend`) and `DefendPage` UI; see `docs/DEFEND.md`. Its battle simulation, `DefendSim` (`defend/sim.ts`), owns the world state and what happens to it (damage, rebuilding, blasts, movement), and steps the units in a fixed order. Each unit type's decisions live in its own module: `enemies.ts`, `troops.ts` (barracks, swordsmen, archers), `civilians.ts` and `towers.ts`. `pathing.ts` holds the pure grid A*, the enemies' flow field and the collision test. All units draw from one seeded random stream, so the step order and each unit's draws decide a replay. `tests/defend-replay.test.ts` steps fixed cities, upgrade levels, seeds, bombs and demolitions through `update()` and hashes the whole sim state every 5 s against `tests/fixtures/defend-replay.golden.json`, reporting when a run first diverges. Regenerate it with `UPDATE_GOLDEN=1` only for an intended gameplay change.

**World generation is deterministic from the run seed** (`random(seed)` in `src/generation.ts`). Player edits (consumed pickups, opened doors) are stored as diffs (`run.changes`) against regenerated terrain rather than saving the map. Changing generation output breaks existing saves' map state, so bump `LAYOUT_VERSION`; migration keeps progression, stats, and inventory, clears map edits, and relocates the player to their section entrance.
- **Tower** (`src/tower/`, entered via `RoomWorld` in `generation.ts`): each floor is a self-contained 17×17 board (15×15 interior), deterministic for `(seed, room)`. Pipeline in `tower/index.ts`: `strategic-graph.ts` plans a floor archetype, a main route of gated hubs to the stairs, and optional branches built from the declarative micro-puzzles in `patterns.ts` (enemy guards key, blue door holds several yellow keys, key chains, choice rooms, temptations…) → `resource-planner.ts` gives doors plausible key sources with depth-dependent probability, without enforcing parity → `embedder.ts` tiles the interior with chambers joined by one-tile gate doorways (no corridors), places shortcuts and stairs, and trims chambers to their contents (`FloorBuilder`), then `furnisher.ts` arranges each chamber (clear walking lanes, enemy rings, guarded niches, item rows, mirrored pillars; `grid.ts` holds the shared rectangle helpers) → `geometryProblems()` check → `analyzer.ts` reports doors, key sources, branches, dead ends, density. `towerDebug()` is available in the browser console. Floors come in sections of `TOWER_SECTION` (10): a section's first floor is sealed below, and every other floor has stairs down. `tests/tower-layout.test.ts` hashes whole floors (tiles and embeddings) for a spread of seeds and depths, plus raw `embed()` retries, against `tests/fixtures/tower-layout.golden.json`. A change there changes saved maps, so it also needs a `LAYOUT_VERSION` bump; regenerate with `UPDATE_GOLDEN=1` only when the layout change is intended.
- **Delve** (`src/delve/`, entered via `World` in `generation.ts`): one endless ascending 30-wide labyrinth with left/right wrap, built per area by `labyrinth.ts` and sliced into 20-row chunks. `World.maintain` keeps only nearby chunks and raises `World.floor` at each milestone gate; terrain below it becomes wall. Its Automove (`automove.ts`) is observation-limited and upgradeable, distinct from Tower's `src/automation.ts`. See `docs/DELVE.md`.
- `validate()`, `bspRooms()`, and `carvePath()` in `generation.ts` are from the pre-overhaul chunk generator: `validate()` is only exercised by `tests/game.test.ts`, and the other two are unused.

**Generation invariants** (break these and tests or saves break):
- Tower geometry is always validated, and the economy never is. `geometryProblems()` requires one connected walkable component containing the entrance, an open tile just inside, and exactly one staircase on the outer wall. Doors and enemies count as passable, so scarce or unwinnable key/HP economies are allowed on purpose. Failed embeddings retry with progressively simpler graphs (12 attempts), then fall back to a minimal start-hall → stairs floor.
- Rare unguarded loot: every plain floor tile reachable from the entrance without passing an enemy gets exactly one `rollUnguardedLoot` roll (`UNGUARDED_LOOT_CHANCE` = 1/1000, in `config.ts`), which yields a key, attack, defense, or treasure pickup. The puzzle graph's own keys never depend on these rolls.
- Decor (`decor.ts`) is planned per tile from board + seed and is presentation only: it must never alter tiles. `planTile` runs one planner per layer (moss, water, vines, standing things) in a fixed order, since later layers read earlier ones. `tests/decor-plan.test.ts` hashes every tile's plan over real Tower floors and Delve chunks against `tests/fixtures/decor-plan.golden.json`, so a refactor that reorders the planners' random draws fails it; regenerate with `UPDATE_GOLDEN=1` only for an intended decor change.

**Movement pipeline.** `input.ts` (tap routes, pointer-captured swipes, keyboard, optional d-pad) → `pathfinding.ts` (wrap-aware, approaches necessary locked doors, prefers an available detour over a door with no key held) → `Game` step logic in `state.ts` (undo history, feedback, loot, death/revive, floor transitions). What a step *does* to the player (fight damage via `combat.ts`, door key costs, pickup amounts) is decided only by the pure `resolveStep()` in `step-effects.ts`. `Game.move`, route previews, the inspect panel, and Delve Automove's planning all call it, so change pickup or door rules there and nowhere else. `tests/step-trace.test.ts` replays seeded Tower/Delve runs against `tests/fixtures/step-trace.golden.json`; if a gameplay change is intended, regenerate with `UPDATE_GOLDEN=1`. Tower automation (`automation.ts`) runs a bounded breadth-first search with separate destination scoring. It stops searching at interactions and replans every step rather than assuming future keys or health, never takes lethal fights, and scores progress against the run record so it can backtrack without oscillating.

**Rendering layers.** `rendering.ts` (`Renderer`) owns the camera and smooth player interpolation. Each `draw()` builds one `FrameContext` (`render-frame.ts`: camera, canvas, settings, and the torches, walls and glows in view) and runs an ordered list of passes over it: ground, floor light and shadows, tile contents, torches and lightmap, route line, hero, then frame edge or weather, and feedback. The passes live in their own modules. `tile-painters.ts` holds the tile art (one painter per tile kind, plus the hero and torch sprites), and every painter draws onto the context it's given. `lighting-pass.ts` (`LightingPass`) handles the Brightness darkness, object glows, torch lightmap and haze, floor relief, and vignette. `entity-lighting.ts` (`EntityLighting`) handles torch-cast sprite shadows and directional light on sprites. `route-path.ts` draws the golden route line. `tests/render-golden.mjs` (`npm run test:render`) draws fixed seeded scenes at fixed timestamps and compares canvas hashes against `tests/fixtures/render.golden.json`. Pixels depend on the browser and GPU, so before changing rendering, regenerate the golden on the unchanged code with `UPDATE_GOLDEN=1`, then compare after your change (diff PNGs go to `test-results/render*/`). The viewport is a fixed 17×17 tiles (`VIEWPORT_TILES`; 20×20 outside); rendering density is independent of world dimensions. `tile-cache.ts` bakes rarely-changing layers (floor, decor pixels) into one offscreen image per layer covering the view plus a margin, and repaints only when the view leaves that area, the board or tile size changes, or tile art is still loading. Battery saver drops to 30 fps while nothing moves. `decor-render.ts` (`DecorLayer`, the renderer's only decor entry point) budgets tile planning per frame and runs decor's passes: `decor-bake.ts` bakes each tile's static pixels for the tile cache, `decor-effects.ts` owns the live state and particle physics (splintering crates, stirred grass, spores, splashes and ripples), `decor-reflections.ts` mirrors sprites into pools, and `decor-sprites.ts` paints crates, parting grass, ripple rings and drips. Glowing blooms and fireflies scale with the Brightness setting. The render golden includes decor scenes (a crate stepped on, a pool waded into, tall grass walked through) that check the effect is live before hashing. Lighting, weather, torch light, outside grass, and tree particles are separate modules.

**Pages and HUD.** `main.ts` only wires things together: it builds the shell, creates the `Game` and `Renderer`, owns the current tab and `navigate()`, and passes each page an `AppContext` (`ui/app.ts`: game, renderer, the shared dialog, `save`, `update` for the HUD, `renderPage`, `navigate`, `confirm`). Each page lives in `src/ui/`: `shell.ts` builds the static layout, `hud.ts` refreshes the stats cluster and board heading, `board-overlay.ts` (`BoardOverlay`) handles board taps (highlight, inspect box, route totals; a second tap walks), `tile-info.ts` produces the inspect text for each tile kind, `skill-tree-page.ts` (`SkillTreePage`, with `pan-zoom.ts`) handles the Upgrades trees, `gear-page.ts` (`GearPage`) handles equipment, crafting and provisions, `settings-page.ts` handles Settings, and `dialogs.ts` holds the log, floor picker, Automove settings, confirm, and run-end summary (`RunEnd`). `frame-loop.ts` runs the requestAnimationFrame loop (drawing, route steps, Automove timing, autosave), and `debug-hooks.ts` installs the `towerDebug`/`delveDebug`/`defendDebug` console helpers. `tests/ui-golden.mjs` (`npm run test:ui`) loads fixed saves with seeded randomness, clicks through every page, tab, tooltip, board tap and dialog, and hashes the `#app` HTML after each step against `tests/fixtures/ui.golden.json`. As with the render golden, regenerate it with `UPDATE_GOLDEN=1` on the unchanged code before a UI change (HTML goes to `test-results/ui*/`).

**Progression/economy.** Balancing, upgrade definitions, and currency rewards are in `src/config.ts`; skill trees are in `skill-trees.ts`; materials/equipment/crafting are in `materials.ts`, `equipment.ts`, `crafting.ts`, `loot.ts`. `docs/CRAFTING_AND_EQUIPMENT.md` and `docs/PROGRESSION_AND_DIFFICULTY.md` are the design source of truth. Tests (e.g. `tests/progression.test.ts`) assert numbers taken from them, so keep code and docs in agreement.

**Saves.** `src/save.ts` loads defensively: `defaults()` defines every field, and loading must tolerate missing or old fields. When adding save state, add it to `defaults()`, the `Save` type in `entities.ts`, and a small decoder called from `decode()` (per-version steps live in `VERSION_STEPS`). Unsupported versions reset safely. `tests/save.test.ts` pins `decode()` behaviour with a corpus of mutated saves hashed against `tests/fixtures/save-decode.golden.json`; if a decode change is intended, regenerate it with `UPDATE_GOLDEN=1 node --experimental-transform-types --test tests/save.test.ts` and review which cases changed.

## Conventions

- Keep this file current. When a change adds, renames, or removes modules, alters architecture or generation invariants, changes commands/scripts or test setup, or changes save rules, update AGENTS.md in the same change. Keep the README's short "How it's built" overview accurate as well. `CLAUDE.md` only imports this file; don't add content there.

- All text uses the bundled Cinzel font (`assets/fonts/Cinzel/`); no remote fonts (browser test checks this).
- Undo, Revive, and pending death rewards have subtle invariants (Revive can't duplicate rewards; undo cancels queued routes; history persists across refreshes). The README's gameplay section is the spec for this player-facing behavior.
- `test-gen.ts` at the root is a scratch experiment, not part of the build or tests.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `sethrimer3/TowerProject`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, both created only when needed. See `docs/agents/domain.md`.
