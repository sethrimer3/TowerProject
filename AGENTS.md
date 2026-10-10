# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, etc.) when working with code in this repository.

## Project

Tower Delve: a mobile-first incremental dungeon RPG in TypeScript + Vite. No backend, no game engine, no framework. Canvas draws the board; the DOM (built as HTML template strings in `src/ui/`) provides controls, stats, and pages. All state persists in `localStorage`.

## Commands

Requires Node 22.18+ (CI uses 24). Tests and tools run `.ts` files directly via `node --experimental-transform-types` (no build step; the experimental warning is expected).

```sh
npm run dev            # Vite on 127.0.0.1:5173 (PORT env overrides)
npm run build          # tsc --noEmit && vite build -> dist/
npm test               # all tests/*.test.ts via node:test (local sample; CI=1 for CI's full size)
node --experimental-transform-types --import ./tests/pin-random.ts --test tests/defend.test.ts                          # one file
node --experimental-transform-types --import ./tests/pin-random.ts --test --test-name-pattern="gold formula" tests/*.test.ts  # one test
npm run test:browser   # Playwright suites (tests/*.mjs); needs `npm run dev` running in another terminal
npm run test:render    # board screenshot hashes vs tests/fixtures/render.golden.json (builds and serves its own copy; no dev server)
npm run test:ui        # page/HUD/dialog HTML hashes vs tests/fixtures/ui.golden.json (builds and serves its own copy; no dev server)
npm run test:snapshots # both of the above side by side on one build (tests/snapshot-suites.mjs): the wall time of the slower one
npm run test:pointer   # Defend board pointer gestures vs tests/fixtures/defend-pointer.golden.json (also needs `npm run dev`)
npm run tower:report -- [seed depth]    # Tower floor generation audit (no args = aggregate over many floors)
npm run tower:report -- --census [--towers 1,2,9] [--floors 1-200] [--band 10] [--seeds 20] [--stride 1]   # doors, keys, enemies and items per floor by tower and band of floors
npm run delve:report -- [seed] [area] [--map]
npm run delve:report -- --census [--tiers 1,2,9] [--floors 1-200] [--band 50] [--seeds 20]   # the same census for the Delve, per equivalent floor
node --experimental-transform-types tools/delve-ai-sim.ts   # headless Automove comparison
npm run tiles:area1 / tiles:outside     # regenerate tile PNGs
npm run cards:stubs                     # regenerate the placeholder card faces in public/assets/cards/
```

- `npm test` runs the broad property checks on a smaller sample and skips the slowest (`tests/test-size.ts`: `FULL`, `ciOnly`); CI sets `CI`, so it runs them in full.
  Set `CI=1` to run the full suite locally.
  The files run in parallel, so one slow file sets the suite's time: give a new slow test its own file.
- Every Node test process preloads `tests/pin-random.ts`, which swaps `Math.random` for a fixed-seed stream before any game module loads, and pins the random streams' start-up seeds by name (`globalThis.__pinnedSeeds`, read by `src/random.ts` and `src/defend/grid.ts`), so they and anything a test leaves to chance are the same on every run, whichever module a test file loads first: a failure always reproduces.
  Run single files with the same `--import` (as above).
  A test that needs other randomness passes its own stream (`new Game(save, rng)`, `newRun({ seed })`, `withStream`).
- Browser tests run in installed Microsoft Edge by default (`PLAYWRIGHT_CHANNEL=chrome` otherwise); `test:browser` and `test:pointer` need the dev server, while the snapshot suites build and serve their own copy.
  Their setup (seeded saves, fixed clocks, snapshot builds, how they wait and record) is in `docs/agents/testing.md`.
- Source imports use explicit `.ts` extensions (`allowImportingTsExtensions`) — required so Node can run them directly. Keep this in new imports.
- `tsconfig` only includes `src/`; tests and tools are not type-checked by `npm run build`.
- CI (`.github/workflows/static.yml`) runs `npm test` and `npm run build` on push to `main`, then deploys `dist/` to GitHub Pages. Vite `base: "./"` keeps asset paths relative — asset URLs must not be root-absolute (a test enforces this).

## Architecture

**Modes.** The modes are `tower`, `delve` (unlocked by upgrade) and `defend` (a tab, unlocked by the `legacy` upgrade).
Tower and Delve share the tab bar's one board button (`data-tab="board"`, wearing the active mode's art); the only way between them is the **forest sign** (`Game.swapForest`: in either forest once the Delve is open, tapped, `#forest-sign`, which `BoardOverlay.placeSign` keeps over the path, or walked onto, the path's foot, `OutsideWorld.atExit`), which leaves the hero at the forest's start tile and arrives at the other's (`switchMode(next, outside)` starts a mode with no run in its forest).
A `Game` built on a save whose Delve run is inside and Tower run isn't opens in the Delve, so a reload mid-run returns to it.
`tests/forest-swap.test.ts` covers the sign, the paused run behind a page, and training bought mid-run surviving undo.
Tower and Delve share one `Game` (`src/state.ts`: movement, pickups, doors, run lifecycle, purchases) and `Renderer` (`src/rendering.ts`).
`game.mode` selects which `save[mode]` slice (run, undo history, revival, bests, looted tiles) is active.
Each slice holds its own mode's run type (`entities.ts`), both built on `RunCore`: a `TowerRun` adds whether the hero has taken fight damage in the current area (`damaged`) and the other visited floors (`floors`), and a `DelveRun` adds the milestone gates crossed (`milestone`).
Automove's memory (`known`, `visited`) sits beside the Delve run in `save.delve.memory`, so undo snapshots never copy or rewind it.
`Game.run` is either one; Tower-only and Delve-only code reads `game.towerRun` or `game.delveRun`, which throw in the other mode.
A run may also be `outside` (`src/outside.ts`), the forest clearing before entering.
How Tower and Delve differ lives in one profile per mode, `MODES[mode]` (`src/modes.ts`): the currency the mode pays and its balance, how progress maps to an equivalent floor (`milestones` pays the currency by `milestonePoints`: one per new one to 100, one per 10 to 1,000, one per 100 to 10,000, then none), the entrance column, layout version and board built from a run, end-of-run gold, loot keys, and the words the game uses for the mode.
`Game`, the HUD, dialogs and pages ask the profile instead of branching on the mode; features only the Tower has (area rewards, sections, deadlock) still test `mode === "tower"`, and drawing picks its art from `BoardLook`.
`tests/modes.test.ts` covers the profiles.
Defend is a separate self-contained system in `src/defend/` with its own save sub-object (`save.defend`) and `DefendPage` UI; see `docs/DEFEND.md`.

**World generation is deterministic from the run seed** (`random(seed)` in `src/random.ts`, a seeded stream, beside `tileRandom`, a fixed number per tile; decor and themes use the same two).
A run starts from `Game.newRun({ outside, seed })`, which rolls the seed when none is given.
Everything else `Game` leaves to chance (new run seeds, enemy drops, treasure loot) draws from the `rng` passed to its constructor (the `game` stream by default), so a test or tool replays a game by passing a seeded stream instead of patching globals.
Randomness outside the world comes from named streams, one per purpose, so drawing from one never shifts another: `stream("game")`, `stream("effects")` (visual effects such as the Upgrades page's particles), and `stream("badges")`, `stream("equipment")` and `stream("missions")` (each seeding, once, the saved stream badge draws, Equipment's Gem pulls and the daily missions given carry on) in `src/random.ts`, and Defend's own `defendRandom("rolls")` (city, battle and weather rolls) and `defendRandom("effects")` (splinters, rain) in `defend/grid.ts`.
Each seeds itself once at start-up from `Math.random` and its name (unless a test pinned that start-up seed: `globalThis.__pinnedSeeds`); nothing else calls `Math.random`, and a new purpose (a minigame, a chance-based effect) gets its own stream.
Tests swap one in with `withStream` / `withDefendStream`.
`tests/random-streams.test.ts` checks that drawing from one stream leaves the others alone and that only the start-up seeds call `Math.random`.
Every board (Tower floor, Delve labyrinth, the forest outside) implements `Board` (`src/board.ts`, which also holds the `reachable` flood fill; it wraps round only when given a width).
Dungeon boards place their torches with `src/torches.ts`, which also works out each torch's visibility polygon once, so generation never reaches into the lighting code.
Player edits (consumed pickups, opened doors) are stored as diffs (`run.changes`) against regenerated terrain rather than saving the map.
Changing generation output breaks existing saves' map state, so bump the mode's layout version (`LAYOUT_VERSION` in `delve/world.ts`, `TOWER_LAYOUT_VERSION` in `tower/room-world.ts`); migration keeps progression, stats, and inventory, clears map edits, and relocates the player to their section entrance.
- `tests/world-boards.test.ts` hashes flood fills (`reachable`, wrapping at the Delve width, with blocked tiles) on seeded synthetic and real chunks, torch spots (`chooseTorchSpots` takes a `TorchArea`: window and seed) and torches, the Delve `World` and Tower `RoomWorld` boards (tiles, steps, wrap, one-way gates, crossings, upkeep, chests, torch breaking) and `rollUnguardedLoot`, against `tests/fixtures/world-boards.golden.json`; regenerate it with `UPDATE_GOLDEN=1` only for an intended change to them.

**Generation invariants** (break these and tests or saves break):
- Tower geometry is always validated, and the economy never is.
  `geometryProblems()` requires one connected walkable component containing the entrance, an open tile just inside, and exactly one staircase on the outer wall.
  Doors and enemies count as passable, so scarce or unwinnable key/HP economies are allowed on purpose.
  Failed embeddings retry with progressively simpler graphs (12 attempts), then fall back to a minimal start-hall → stairs floor.
- Rare unguarded loot: every plain floor tile reachable from the entrance without passing an enemy gets exactly one `rollUnguardedLoot` roll (`UNGUARDED_LOOT_CHANCE` = 1/1000, in `config.ts`), which yields a key, attack, defense, or treasure pickup.
  The puzzle graph's own keys never depend on these rolls.
- Generation and anything saved or played by (Tower floors, Delve regions, torch spots, enemy stats, prices, Defend layout fits and cities) must come out the same in every JavaScript engine, since a save made in one browser, or before a browser update, is regenerated in the next.
  Two things the language leaves to each engine are therefore off limits there: randomness drawn inside a `sort` comparator (how often an engine compares is its own business, so draw each item's random key first and sort on it), and the inexact `Math` functions (`pow`/`**`, `exp`, `log`, trig, `hypot`, whose last bit can differ).
  Use `+ - * /`, `Math.sqrt` (exact everywhere) and `intPow` from `src/exact.ts`.
  Drawing may use `Math` freely.
  `tests/engine-independence.test.ts` rebuilds all of it under a different stable sort and requires identical output, requires that it calls none of those `Math` functions, and scans the generation modules for `**`.
- Decor (`decor.ts`) is planned per tile from board + seed and is presentation only: it must never alter tiles.
  `planTile` runs one planner per layer (moss, water, vines, standing things) in a fixed order, since later layers read earlier ones.
  `tests/decor-plan.test.ts` hashes every tile's plan over real Tower floors and Delve chunks against `tests/fixtures/decor-plan.golden.json`, so a refactor that reorders the planners' random draws fails it; regenerate with `UPDATE_GOLDEN=1` only for an intended decor change.

## Topic docs

Each area's modules, rules and tests live in a topic doc in `docs/agents/`.
Read the area's doc before changing code there or answering questions about it; read every doc a change spans.

- `tower-generation.md`: Tower floor generation (`src/tower/`): the pipeline, doors and keys, forks, embedding, the enemy schedule and stage, bosses, early floors.
- `delve.md`: the Delve labyrinth and its Automove (`src/delve/`).
- `movement-and-combat.md`: steps and `resolveStep`, fights and encounters, falling, Revive, crits, Lifesteal, kill pay, run training, Buy Quantity, gains.
- `hand-and-automation.md`: the planners, Tower automation, the hand and cards, card badges, Focus, Ignore and Target, Rush, play/pause, deadlock.
- `tiers-goals-areas.md`: tiers, Goals and Warp, Tower floor transitions, undo's `restore`, area rewards.
- `progression.md`: enemy curves and stats, the loadout, fractions, XP and Training, the Archives, free purchases, skill trees, Equipment.
- `economy-and-online.md`: Gems, the Shop, Gold bonuses, Spare Change and Wishing Well, the Tournament, Mail, Missions.
- `rendering.md`: board drawing, lighting, decor, popups, the forest and weather, the render goldens, the Medieval and Neon themes.
- `ui.md`: `main.ts`, pages, the HUD, dialogs, the desks and `Game`'s UI commands, board lessons, the frame loop, the UI golden.
- `saves.md`: loading and decoding the save, adding save state, settings rows.
- `defend.md`: Defend (`src/defend/`).
- `testing.md`: browser test setup.

## Conventions

- Keep this file and the topic docs current.
  When a change adds, renames, or removes modules, alters architecture or generation invariants, changes commands/scripts or test setup, or changes save rules, update the topic doc for its area in the same change, and this file only for what every task needs (commands, the core architecture, invariants, conventions).
  A new area gets its own topic doc and a line in the list above naming what it covers.
  Keep the README's short "How it's built" overview accurate as well.
  `CLAUDE.md` only imports this file; don't add content there.
- Write one sentence per line (a paragraph's lines render joined), and start a new line for each new fact, so diffs and merges stay local; don't re-join lines into long paragraphs.
- `CONTEXT.md` is the domain glossary (terms only, no implementation). Use its words in code, comments and docs, and add a term there when a change names a new domain concept.

- Gem purchases (anything paid in Gems: hand slots, trainers, archivists, finishing training, resets) always look active and prominent, never `disabled` or greyed out for lack of Gems.
  A button short of Gems gets the `short` class, which turns only its price red, and a press while short opens `askForGems` (`ui/dialogs.ts`), offering the Shop (on the Shop page itself, a Gem-priced offer short of Gems points to the Gem packs instead).
  Only a purchase that can't happen at all (sold out, all hired, locked) may look unavailable.
- All text uses the bundled Cinzel font (`assets/fonts/Cinzel/`); no remote fonts (browser test checks this).
- Undo has subtle invariants (it can't duplicate rewards; undo cancels queued routes; history persists across refreshes; it never leaves the floor: `advanceTowerRoom` and `descendTowerRoom` empty the history, as `afterDelveStep` does for a step onto another equivalent floor (by `World.depth`, either way) or across a milestone gate, so a snapshot is always of the floor the hero stands on).
  The README's gameplay section is the spec for this player-facing behavior.
- `test-gen.ts` at the root is a scratch experiment, not part of the build or tests.

### Golden tests: re-record them when visuals or content change on purpose

Most tests here are characterization goldens (`tests/fixtures/*.golden.json`): they pin current output, so an *intended* change to art, assets or content fails them until they are re-recorded. Treat re-recording as part of that change, never a separate cleanup.

| When you change… | Re-record |
|---|---|
| Pixels of a PNG in `public/assets/` (edited art, `npm run tiles:area1` / `tiles:outside`) | `render.golden.json` (`npm run test:render`) |
| A PNG's name, path or size, or add/remove one the game loads | the above, plus `render-calls` (it reads real PNG sizes; sprite-sheet frames depend on width), and `art-modules` / `lighting-passes` if the renamed file is one they draw |
| Board drawing code (`rendering.ts`, `tile-painters.ts`, lighting, decor, route line, Defend render/art) | `render-calls`, `render.golden.json`, and the module's own golden (`lighting-passes`, `art-modules`, `terrain-paint`, `outdoor-art`, `defend-fences-save`) |
| Procedural terrain art (`themes.ts`) | `terrain-paint`, `render-calls`, `render.golden.json` |
| World or content generation (Tower floors, Delve labyrinth, decor plans, Defend cities) | the generation golden (`tower-layout`, `tower-planning`, `delve-labyrinth`, `decor-plan`, `world-boards`, `defend-city`), then every golden that plays on those boards (`step-trace`, `undo-clear-trace`, `tower-automation`, `delve-automove`, `defend-replay`, `render-calls`, `render.golden.json`); saved maps change, so also bump `LAYOUT_VERSION` |
| Gameplay rules or balance (`config.ts`, `step-effects.ts`, enemies, pickups, Defend units) | `step-trace`, `undo-clear-trace`, `tower-automation`, `delve-automove`, `tournament-trace`, `defend-replay` as they fail |
| UI text, pages, HUD or dialogs | `ui.golden.json` (`npm run test:ui`), and `defend-pointer.golden.json` for the Defend page |
| Save format | `save-decode` |

While iterating, run only the tests for the area you touched, then `npm test` once before committing (after pushing, don't wait on CI):

| Area | Tests (`node --experimental-transform-types --import ./tests/pin-random.ts --test …`) |
|---|---|
| Tower generation (`src/tower/`) | `tests/tower-*.test.ts tests/world-boards.test.ts tests/decor-plan.test.ts` |
| Delve labyrinth (`src/delve/labyrinth.ts`, `world.ts`) | `tests/delve.test.ts tests/delve-labyrinth.test.ts tests/delve-schedule.test.ts tests/door-runs.test.ts tests/world-boards.test.ts tests/decor-plan.test.ts` |
| Automove and the hand (`automation.ts`, `delve/automove.ts`, `pathfinding.ts`, `cards.ts`) | `tests/cards.test.ts tests/game-commands.test.ts tests/planners.test.ts tests/tower-automation.test.ts tests/tower-overhaul.test.ts tests/delve-automove.test.ts` (and `CI=1 … tests/delve-ai-tiers.test.ts`) |
| Movement, steps, run lifecycle (`state.ts`, `step-effects.ts`, `tower/climb.ts`, `tower/area-ledger.ts`) | `tests/step-*.test.ts tests/undo-clear-trace.test.ts tests/game*.test.ts tests/movement.test.ts tests/doors.test.ts tests/tower-climb.test.ts tests/area-ledger.test.ts tests/fight-playback.test.ts` |
| Economy (`config.ts`, `loadout.ts`, gear, skill trees, `archives.ts`, `modes.ts`) | `tests/archives.test.ts tests/loadout.test.ts tests/progression.test.ts tests/loot.test.ts tests/skill-trees.test.ts tests/modes.test.ts tests/step-trace.test.ts` |
| Saves and settings | `tests/save.test.ts tests/settings.test.ts` |
| Board drawing, lighting, decor art | `tests/render-calls.test.ts tests/lighting-passes.test.ts tests/art-modules.test.ts tests/terrain-paint.test.ts tests/decor.test.ts` |
| Outside and weather | `tests/outside*.test.ts tests/outdoor-art.test.ts tests/torch-light.test.ts` |
| Defend (`src/defend/`) | `tests/defend*.test.ts` |

Run a browser golden only when the change reaches what it captures: `test:ui` for pages, HUD and dialogs; `test:render` for board drawing, art, or anything that changes the render scenes' boards (`test:snapshots` for both at once); `test:pointer` for the Defend page.

How:
1.
**Refactor (no visible change intended):** re-record nothing.
Every golden must still match after the change.
The browser goldens' hashes are machine-specific, so if one fails, record it on the unchanged code (`git stash`, then `UPDATE_GOLDEN=1`), restore the change, and compare again; only a failure then is yours.
2.
**Intended change:** make it, run `npm test` (and the browser goldens if visuals or UI changed) and check that only the keys the change should touch fail; for pixels, look at the PNGs in `test-results/render*/`.
Then re-record those goldens with `UPDATE_GOLDEN=1` (one file: `UPDATE_GOLDEN=1 node --experimental-transform-types --import ./tests/pin-random.ts --test tests/<name>.test.ts`), commit the fixtures in the same commit, and say in the message which goldens were re-recorded and why.
3.
The browser goldens build and serve their own copy of the app (no dev server needed) and aren't run by CI; when visuals or UI change, run them yourself.
The Node goldens run in CI on Linux, so they must hash the same on every OS: one whose hashes depend on `Math.pow` imports `tests/portable-math.ts` first.

## Agent skills

### Adding an upgrade

`.claude/skills/add-upgrade/` defines a new skill-tree node, Archives research or Defend Armory upgrade: it writes a spec (panel, name, cost, levels, placement, research hours, unlocks) for approval, then builds it.
Its `references/panels.md` describes each panel's rows, prices, effects and unlocks; keep it current when those mechanisms change.

### Adding a Training row

`.claude/skills/add-training/` adds a Training row or changes one's cap or prices: it writes a spec (group, effect, level cap, point cost, trainer Gold and time curves, the run's Silver schedule, unlock, where the effect is read) for approval, then builds it.
Keep its file list current when Training's pricing or value functions move.

### Adding a card badge

`.claude/skills/add-badge/` adds a new card badge: it reads the badge system, asks the questions the request leaves open (each badge's effect on every card, triggers, fractions, lethality, bosses, undo, the Dev grant) with proposed defaults, writes a spec for approval, then builds it.
Keep its file list current when the badge mechanism moves.

### Issue tracker

Issues live in GitHub Issues on `sethrimer3/TowerProject`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, both created only when needed. See `docs/agents/domain.md`.
