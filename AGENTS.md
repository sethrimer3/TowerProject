# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, etc.) when working with code in this repository.

## Project

TowerIncramental: a mobile-first incremental dungeon RPG in TypeScript + Vite. No backend, no game engine, no framework. Canvas draws the board; the DOM (built as HTML template strings in `src/main.ts`) provides controls, stats, and pages. All state persists in `localStorage`.

## Commands

Requires Node 22.18+ (CI uses 24). Tests and tools run `.ts` files directly via `node --experimental-transform-types` (no build step; the experimental warning is expected).

```sh
npm run dev            # Vite on 127.0.0.1:5173 (PORT env overrides)
npm run build          # tsc --noEmit && vite build -> dist/
npm test               # all tests/*.test.ts via node:test
node --experimental-transform-types --test tests/defend.test.ts                          # one file
node --experimental-transform-types --test --test-name-pattern="gold formula" tests/*.test.ts  # one test
npm run test:browser   # Playwright suites (tests/*.mjs); needs `npm run dev` running in another terminal
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

**Modes.** Tabs switch between `tower`, `delve` (unlocked by upgrade), and `defend` (unlocked by the `legacy` upgrade). Tower and Delve share one `Game` (`src/state.ts`: movement, pickups, doors, run lifecycle, purchases) and `Renderer` (`src/rendering.ts`). `game.mode` selects which `save[mode]` slice (run, undo history, revival, bests, looted tiles) is active. A run may also be `outside` (`src/outside.ts`), the forest clearing before entering. Defend is a separate self-contained system in `src/defend/` with its own save sub-object (`save.defend`) and `DefendPage` UI; see `docs/DEFEND.md`.

**World generation is deterministic from the run seed** (`random(seed)` in `src/generation.ts`). Player edits (consumed pickups, opened doors) are stored as diffs (`run.changes`) against regenerated terrain rather than saving the map. Changing generation output breaks existing saves' map state, so bump `LAYOUT_VERSION`; migration keeps progression, stats, and inventory, clears map edits, and relocates the player to their section entrance.
- **Tower** (`src/tower/`, entered via `RoomWorld` in `generation.ts`): each floor is a self-contained 17×17 board (15×15 interior), deterministic for `(seed, room)`. Pipeline in `tower/index.ts`: `strategic-graph.ts` plans a floor archetype, a main route of gated hubs to the stairs, and optional branches built from the declarative micro-puzzles in `patterns.ts` (enemy guards key, blue door holds several yellow keys, key chains, choice rooms, temptations…) → `resource-planner.ts` gives doors plausible key sources with depth-dependent probability, without enforcing parity → `embedder.ts` tiles the interior with chambers joined by one-tile gate doorways (no corridors) → `geometryProblems()` check → `analyzer.ts` reports doors, key sources, branches, dead ends, density. `towerDebug()` is available in the browser console. Floors come in sections of `TOWER_SECTION` (10): a section's first floor is sealed below, and every other floor has stairs down.
- **Delve** (`src/delve/`, entered via `World` in `generation.ts`): one endless ascending 30-wide labyrinth with left/right wrap, built per area by `labyrinth.ts` and sliced into 20-row chunks. `World.maintain` keeps only nearby chunks and raises `World.floor` at each milestone gate; terrain below it becomes wall. Its Automove (`automove.ts`) is observation-limited and upgradeable, distinct from Tower's `src/automation.ts`. See `docs/DELVE.md`.
- `validate()`, `bspRooms()`, and `carvePath()` in `generation.ts` are from the pre-overhaul chunk generator: `validate()` is only exercised by `tests/game.test.ts`, and the other two are unused.

**Generation invariants** (break these and tests or saves break):
- Tower geometry is always validated, and the economy never is. `geometryProblems()` requires one connected walkable component containing the entrance, an open tile just inside, and exactly one staircase on the outer wall. Doors and enemies count as passable, so scarce or unwinnable key/HP economies are allowed on purpose. Failed embeddings retry with progressively simpler graphs (12 attempts), then fall back to a minimal start-hall → stairs floor.
- Rare unguarded loot: every plain floor tile reachable from the entrance without passing an enemy gets exactly one `rollUnguardedLoot` roll (`UNGUARDED_LOOT_CHANCE` = 1/1000, in `config.ts`), which yields a key, attack, defense, or treasure pickup. The puzzle graph's own keys never depend on these rolls.
- Decor (`decor.ts`) is planned per tile from board + seed and is presentation only: it must never alter tiles.

**Movement pipeline.** `input.ts` (tap routes, pointer-captured swipes, keyboard, optional d-pad) → `pathfinding.ts` (wrap-aware, approaches necessary locked doors, prefers an available detour over a door with no key held) → `Game` step logic in `state.ts` (undo history, feedback, loot, death/revive, floor transitions). What a step *does* to the player (fight damage via `combat.ts`, door key costs, pickup amounts) is decided only by the pure `resolveStep()` in `step-effects.ts`. `Game.move`, route previews, the inspect panel, and Delve Automove's planning all call it, so change pickup or door rules there and nowhere else. `tests/step-trace.test.ts` replays seeded Tower/Delve runs against `tests/fixtures/step-trace.golden.json`; if a gameplay change is intended, regenerate with `UPDATE_GOLDEN=1`. Tower automation (`automation.ts`) runs a bounded breadth-first search with separate destination scoring. It stops searching at interactions and replans every step rather than assuming future keys or health, never takes lethal fights, and scores progress against the run record so it can backtrack without oscillating.

**Rendering layers.** `rendering.ts` owns the camera, smooth player interpolation, torchlight, and transient combat/pickup text. The viewport is a fixed 17×17 tiles (`VIEWPORT_TILES`; 20×20 outside); rendering density is independent of world dimensions. `tile-cache.ts` bakes rarely-changing layers (floor, decor pixels) into one offscreen image per layer covering the view plus a margin, and repaints only when the view leaves that area, the board or tile size changes, or tile art is still loading. Battery saver drops to 30 fps while nothing moves. `decor-render.ts` runs decor's live parts (splintering crates, rippling reflective pools, parting grass, spores, fireflies, glow that scales with the Brightness setting). Lighting, weather, torch light, outside grass, and tree particles are separate modules.

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
