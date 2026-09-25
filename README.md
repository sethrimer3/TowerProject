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

**Undo** restores one move (a tapped route counts as a single move), including combat, pickups, gear, keys, doors, and height. It cancels any queued route. One history slot is available initially; four levels of **Echoes of time** expand capacity to 2, 3, 4, then 5 moves. History persists across refreshes.

Death immediately starts a fresh run at the entrance (floor 1 / height 0) and clears normal undo history. The **Revive** upgrade changes the button to Revive until the first successful move in the new run. It restores the state immediately before the fatal move. A blocked move does not expire it; undoing the first new move cannot bring it back. While Revive is available, death Essence is held pending and paid only when continuing, so reviving cannot duplicate rewards. Revive eligibility also persists across refreshes.

Rewards are credited as you climb (Courage for every 10 Delve height, Inspiration for each new Tower floor and floor clear), so retiring from Settings simply starts a fresh run. Starting-stat and equipment upgrades apply on the next ascent; Wayfinder, Revive, and undo-capacity upgrades unlock immediately. Automation still avoids lethal fights and pauses outside the Tower tab, in dialogs, and when hidden. No offline progress is calculated.


## How it's built

Three modes share one page: **Tower** (compact 17 × 17 puzzle floors, generated strategy-first like a Magic Tower), **Delve** (one endless, wrapping labyrinth), and **Defend** (a city-defense simulation). Worlds are generated deterministically from the run seed, and only your changes to them are saved. The viewport shows 17 × 17 tiles with the entrance at the bottom center (20 × 20 in the forest outside); in the Delve, terrain below the last milestone gate can't be revisited.

Code lives in `src/`, with the Tower generator in `src/tower/`, the Delve labyrinth in `src/delve/`, Defend in `src/defend/`, and the pages, HUD and dialogs in `src/ui/`. Design documents are in `docs/`. Architecture notes, generation invariants, and development commands for contributors (human or AI) are in [AGENTS.md](AGENTS.md).

## Browser verification

Start `npm run dev` in another terminal, then run `npm run test:browser`. See [AGENTS.md](AGENTS.md) for browser-channel and screenshot details.

## GitHub Pages

The included `.github/workflows/static.yml` installs dependencies, runs tests and the production build, then deploys **dist/** on pushes to `main` or manual workflow dispatch. In repository Settings → Pages, select **GitHub Actions** as the source. Vite uses relative asset paths for repository subpaths.

## Prototype boundaries

Room variety and balancing are introductory. Locked passages gate both ascent routes and reward branches; enemies inside chambers are often avoidable. Combat resolves instantly. Automation prioritizes nearby upgrades and safe ascent, rather than globally optimal inventory planning. Very old tower sections cannot be revisited. Unsupported save-format versions reset safely. Layout-version migration retains progression, stats, and inventory, clears old map edits, and relocates the player to their current section entrance. All text uses the bundled variable Cinzel font from `assets/fonts/Cinzel/`; no remote font service is used. Weather is the only sound. There is no offline progression, cloud save, or installable PWA.
