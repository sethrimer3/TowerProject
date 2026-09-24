# TowerIncramental

A playable, original mobile-first incremental tower RPG. Canvas draws the dungeon and pixel entities; accessible DOM controls provide navigation, statistics, inspection, and progression. No backend or runtime game engine.

## Run

Use Node.js 22.18+ (tested with 24.15) and npm:

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

Open the local URL printed by Vite. Tap an open tile to walk to it, fighting monsters and collecting items along the route. Swipes move one tile in any cardinal direction. Keyboard arrows / WASD also work; on-screen arrows are off by default and can be enabled in Settings. Monsters on manual routes are fought even when lethal. Missing keys stop movement at the necessary door, with a fading red X; unreachable wall targets get the same feedback at the tapped spot. Routing prefers an available detour over a door for which no key is held.

Movement transitions can be set to **Smooth** (default), **Fast**, or **Off (instant)** in Settings. This controls camera and player interpolation on both axes; Reduce motion overrides it with instant movement.

Matching open left/right world edges wrap to each other. Locked doors and enemies at the destination still apply. Openings have no solid frame across them and show continuation chevrons. Viewport cropping is not a wrap boundary; the world is 30 tiles wide. Vertical movement remains continuous upward.

**Undo** restores one tile move, including combat, pickups, gear, keys, doors, and height. It cancels any queued route. One history slot is available initially; four levels of **Echoes of time** expand capacity to 2, 3, 4, then 5 moves. History persists across refreshes.

Death immediately starts a fresh run at the entrance (floor 1 / height 0) and clears normal undo history. The **Revive** upgrade changes the button to Revive until the first successful move in the new run. It restores the state immediately before the fatal move. A blocked move does not expire it; undoing the first new move cannot bring it back. While Revive is available, death Essence is held pending and paid only when continuing, so reviving cannot duplicate rewards. Revive eligibility also persists across refreshes.

Retire from Settings to claim Essence. Starting-stat and equipment upgrades apply on the next ascent; Wayfinder, Revive, and undo-capacity upgrades unlock immediately. Automation still avoids lethal fights and pauses outside the Tower tab, in dialogs, and when hidden. No offline progress is calculated.


## Architecture / files

- `src/config.ts`: balancing, upgrade definitions, currency rewards.
- `src/entities.ts`: tiles, player, equipment, and versioned save types.
- `src/generation.ts`: seeded PRNG, Delve chunks (30 wide, BSP chambers and corridors), bounded chunk retention, and the `RoomWorld` board for Tower floors.
- `src/tower/`: strategy-first Tower floor generation, Magic-Tower style. `strategic-graph.ts` plans a floor archetype, a main route of gated hubs to the stairs, and optional branches built from the declarative micro-puzzles in `patterns.ts` (enemy guards key, blue door holds several yellow keys, key chains, choice rooms, temptations…). `resource-planner.ts` gives doors plausible key sources with depth-dependent probability, without enforcing parity, so scarce or unwinnable floors remain possible. `embedder.ts` tiles the 15x15 interior with chambers joined by one-tile gate doorways (no corridors) and arranges contents in rows, guarded niches and enemy rings. `analyzer.ts` reports doors, key sources, branches, dead ends and density; run `npm run tower:report [seed depth]`, or call `towerDebug()` in the browser console. Geometry is always validated; the economy never is.
- `src/state.ts`: movement, pickups, doors, run lifecycle, purchases.
- `src/combat.ts`: pure combat forecasting.
- `src/automation.ts`: bounded breadth-first search and separate destination scoring. Stops search at interactions and replans each step to avoid assuming future keys or health.
- `src/rendering.ts`: original code-drawn sprites, stone tiles, torchlight, smooth camera and player interpolation, transient pickup/combat text. Rendering density is independent of world dimensions.
- `src/decor.ts`: procedural dungeon dressing, planned per tile from the board and seed (presentation only, never alters tiles). Continuous noise fields give moss that fades across tile seams with an ordered-dither gradient and creeps up wall faces, walk-through tall-grass thickets where it is densest, and pools of water; vines climb walls and creep along floors with glowing flowers; crates and barrels stack in corners and against walls; tufts, ferns, sprouts, glowcap mushrooms, pebbles, and cobwebs fill in. Each Tower room rolls its own lushness, dampness, and clutter; the Delve drifts between them with depth.
- `src/decor-render.ts`: draws the decor (static pixels baked once per tile) and runs its live parts: crates splinter when stepped on (pieces bounce off walls and settle), pools ripple around the hero and catch ceiling drips, and mirror whatever stands on or beside them (the hero, items, enemies, doors, torches, crates, and faintly the walls), with the reflection bent by each ripple ring and a faint shimmer, tall grass parts around the hero and covers its feet, mushrooms puff spores, and flowers, glowcaps, and fireflies glow more strongly the darker the Brightness setting.
- `src/outside-grass.ts`: wind-blown grass in the forest outside, with gusts that sweep across the clearing (stronger in rain and storms) and blades that part around the hero and flick back after it passes.
- `src/input.ts`: tap routes, pointer-captured swipes, keyboard, and optional directional buttons.
- `src/pathfinding.ts`: shared wrap-aware route search that approaches necessary locked doors.
- `src/save.ts`: defensive versioned localStorage load and save.
- `src/main.ts`, `src/style.css`: UI, navigation, settings, confirmations, frame scheduling, responsive styling.
- `tests/game.test.ts`: deterministic generation, combat, movement, progression, automation, save handling, density independence.
- `tests/browser.mjs`: end-to-end mobile/desktop smoke checks and screenshots using Playwright.

Generation validates all walkable space, verifies that removing each door disconnects an area, and simulates collecting and consuming keys from an empty inventory. Every lock gates a chamber or branch; there are no bypass corridors. The three central chambers form an explicit northbound ascent, with its amber and azure keys placed directly before their locks. An entrance guardian gates the first keys; unlocked branch entrances also have guardians. Validation allows theoretical traversal through enemies and doors while rejecting disconnected floor space and impossible key dependencies. The first guardian is safely beatable with the default loadout. Optional reward branches remain randomized. Golden stairs mark the upward section exit. Rooms have variable widths, sculpted perimeter notches, internal pillars, different passage positions, and supply / armory / treasure roles. Every sculpting edit preserves cardinal connectivity and door anchors. Normal keys and equipment are behind an encounter or lock. Each empty floor tile reachable from the section entrance with ALL doors and enemies blocked gets exactly one deterministic 1/1000 rare-loot roll; success chooses a key, attack pickup, defense pickup, or equipment treasure. Essential keys never depend on these rolls. Automatic climbing scores progress against the run record so it can backtrack without oscillating between cleared rooms.

The default viewport shows exactly 20 × 20 square tiles. The entrance is bottom-center. Density options 16/20/24/30 change only the camera. Four recent chunks remain available; terrain below the retention boundary becomes inaccessible. Consumed pickups in retained chunks are saved. Current equipment is preserved across refreshes and reset to permanent starting quality between runs.

## Browser verification

Start `npm run dev` in another terminal, then run `npm run test:browser` (includes the gesture / undo / Revive suite). The test uses installed Microsoft Edge by default. To use another installed Playwright channel, set `PLAYWRIGHT_CHANNEL` (e.g. `chrome`). Screenshots are written to `test-results/`. Core tests use Node's experimental TypeScript transformation and may print its experimental warning.

## GitHub Pages

The included `.github/workflows/static.yml` installs dependencies, runs tests and the production build, then deploys **dist/** on pushes to `main` or manual workflow dispatch. In repository Settings → Pages, select **GitHub Actions** as the source. Vite uses relative asset paths for repository subpaths. No deployment has been performed by this prototype task.

## Prototype boundaries

Art is intentionally small and code-drawn; room variety and balancing are introductory. Locked passages gate both ascent routes and reward branches; enemies inside chambers are often avoidable. Combat resolves instantly. Automation prioritizes nearby upgrades and safe ascent, rather than globally optimal inventory planning. Very old tower sections cannot be revisited. Unsupported save-format versions reset safely. Layout-version migration retains progression, stats, and inventory, clears old map edits, and relocates the player to their current section entrance. All text uses the bundled variable Cinzel font from `assets/fonts/Cinzel/`; no remote font service is used. There is no sound, offline progression, cloud save, or installable PWA.

The most valuable next step is adding varied room templates and testing the economy over many automated runs, especially the transition from manual exploration to permanent upgrades.
