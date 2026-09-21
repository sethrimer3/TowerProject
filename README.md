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

Open the local URL printed by Vite. Arrow keys / WASD, the directional buttons, and adjacent tile taps move cardinally. Tap any creature for its exact combat forecast. Lethal fights are blocked; an inspected adjacent lethal creature can be challenged through explicit confirmation. The player attacks first, so enemy retaliation is `max(0, enemyAttack - defense) * (ceil(enemyHP / max(1, attack - enemyDefense)) - 1)`.

Retire from Settings to claim Essence, or deliberately challenge a lethal enemy. Buy permanent upgrades in Upgrades. Starting-stat and equipment upgrades apply on the next ascent; Wayfinder unlocks automation immediately. Automation can be paused, and its speed changed. It pauses on other pages, in dialogs, and in hidden browser tabs. No offline progress is calculated.

## Architecture / files

- `src/config.ts`: balancing, upgrade definitions, currency rewards.
- `src/entities.ts`: tiles, player, equipment, and versioned save types.
- `src/room-shapes.ts`: connected room erosion for stepped alcoves, irregular perimeters, wall fingers, and interior pillars; protected doorway anchors.
- `src/generation.ts`: seeded PRNG, validated 30-wide / 20-high chunks, nine varied chambers with a central ascent and randomized tree branches, separating locks, parent-room keys, themed rewards, bounded chunk retention.
- `src/state.ts`: movement, pickups, doors, run lifecycle, purchases.
- `src/combat.ts`: pure combat forecasting.
- `src/automation.ts`: bounded breadth-first search and separate destination scoring. Stops search at interactions and replans each step to avoid assuming future keys or health.
- `src/rendering.ts`: original code-drawn sprites, stone tiles, torchlight, smooth camera and player interpolation, transient pickup/combat text. Rendering density is independent of world dimensions.
- `src/input.ts`: keyboard, pointer, and touch direction controls.
- `src/save.ts`: defensive versioned localStorage load and save.
- `src/main.ts`, `src/style.css`: UI, navigation, settings, confirmations, frame scheduling, responsive styling.
- `tests/game.test.ts`: deterministic generation, combat, movement, progression, automation, save handling, density independence.
- `tests/browser.mjs`: end-to-end mobile/desktop smoke checks and screenshots using Playwright.

Generation validates all walkable space, verifies that removing each door disconnects an area, and simulates collecting and consuming keys from an empty inventory. Every lock gates a chamber or branch; there are no bypass corridors. The three central chambers form an explicit northbound ascent, with its amber and azure keys placed directly before their locks. An entrance guardian gates the first keys; unlocked branch entrances also have guardians. Validation allows theoretical traversal through enemies and doors while rejecting disconnected floor space and impossible key dependencies. The first guardian is safely beatable with the default loadout. Optional reward branches remain randomized. Golden stairs mark the upward section exit. Rooms have variable widths, sculpted perimeter notches, internal pillars, different passage positions, and supply / armory / treasure roles. Every sculpting edit preserves cardinal connectivity and door anchors. Normal keys and equipment are behind an encounter or lock. Each empty floor tile reachable from the section entrance with ALL doors and enemies blocked gets exactly one deterministic 1/1000 rare-loot roll; success chooses a key, attack pickup, defense pickup, or equipment treasure. Essential keys never depend on these rolls. Automatic climbing scores progress against the run record so it can backtrack without oscillating between cleared rooms.

The default viewport shows exactly 20 × 20 square tiles. The entrance is bottom-center. Density options 16/20/24/30 change only the camera. Four recent chunks remain available; terrain below the retention boundary becomes inaccessible. Consumed pickups in retained chunks are saved. Current equipment is preserved across refreshes and reset to permanent starting quality between runs.

## Browser verification

Start `npm run dev` in another terminal, then run `npm run test:browser`. The test uses installed Microsoft Edge by default. To use another installed Playwright channel, set `PLAYWRIGHT_CHANNEL` (e.g. `chrome`). Screenshots are written to `test-results/`. Core tests use Node's experimental TypeScript transformation and may print its experimental warning.

## GitHub Pages

The included `.github/workflows/static.yml` installs dependencies, runs tests and the production build, then deploys **dist/** on pushes to `main` or manual workflow dispatch. In repository Settings → Pages, select **GitHub Actions** as the source. Vite uses relative asset paths for repository subpaths. No deployment has been performed by this prototype task.

## Prototype boundaries

Art is intentionally small and code-drawn; room variety and balancing are introductory. Locked passages gate both ascent routes and reward branches; enemies inside chambers are often avoidable. Combat resolves instantly. Automation prioritizes nearby upgrades and safe ascent, rather than globally optimal inventory planning. Very old tower sections cannot be revisited. Unsupported save-format versions reset safely. Layout-version migration retains progression, stats, and inventory, clears old map edits, and relocates the player to their current section entrance. All text uses the bundled variable Cinzel font from `assets/fonts/Cinzel/`; no remote font service is used. There is no sound, offline progression, cloud save, or installable PWA.

The most valuable next step is adding varied room templates and testing the economy over many automated runs, especially the transition from manual exploration to permanent upgrades.
