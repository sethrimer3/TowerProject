# Tower Delve

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

Open the local URL printed by Vite.

## How to play

A new game starts inside its first Tower run.
Inside a run, your **hand** of cards moves the hero: press a card and the hero walks to its target (the stairs, a door, a key, an enemy …), and fights play out on their own.
A new game's hand holds only Stairs; the Inspiration tree's first skills add Door and Key, then Enemy, then **Auto-Climb**, after which the first card that can reach a target leads on its own.
Each new Tower floor climbed pays **Inspiration**, and each Tower Goal claimed a **Breakthrough** point; both buy skills in the trees on the Upgrades page.
The Delve opens only during a Tournament, whose runs it plays.
**Gold** and **XP** last between runs: Gold buys provisions, trainers and Archives research, and each level earns training points.
**Silver**, found inside a run, buys training for that run only.
When no card can act, End Climb returns the hero to the forest, where the next climb is entered.

## Gameplay reference

The player-facing rules, in full, one topic a page:

| Page | What it covers |
|---|---|
| [First steps](docs/gameplay/first-steps.md) | The first runs and their lessons, the tab bar and its dots, the forest and its sign, moving by hand, the Archives lesson |
| [The hand and cards](docs/gameplay/hand-and-cards.md) | The hand and every card, card levels and trees, card buys, the Deck page, pressing a card, Ignore and Target, Badges |
| [Upgrades](docs/gameplay/upgrades.md) | The skill trees' tabs, prices and help, Critical |
| [Gear and Equipment](docs/gameplay/gear-and-equipment.md) | Provisions, the Blacksmith and Equipment |
| [The Archives](docs/gameplay/archives.md) | Archivists, Rush, Cells and Speed Up, the library |
| [Skills and stats](docs/gameplay/skills-and-stats.md) | Shroud, potions, Silver and Gold skills, Free Training, Buy Quantity, Revive, Thorns, Parry |
| [Fights](docs/gameplay/fights.md) | How a fight plays out, Fast, Ranged, Flying and Shielded monsters, the Archer, kill pay, fractions |
| [Floors](docs/gameplay/floors.md) | Bosses and Greater Bosses, doors and keys, the early floors, world wrap |
| [Training](docs/gameplay/training.md) | Silver, training for the run, XP and levels, the Training tab and trainers |
| [Proving Grounds](docs/gameplay/proving-grounds.md) | Three control modes, the Light Elemental, Keymaster, keys and mimics |
| [Runs](docs/gameplay/runs.md) | Movement settings, Undo, how a run ends, Run Notes, rewards, the in-run controls, Dash |
| [Cinematic mode](docs/gameplay/cinematic-mode.md) | The board alone: entering and leaving it, idle dimming, Gems in it |
| [Currencies and the Shop](docs/gameplay/currencies-and-shop.md) | Gems and Gem finds, the ad boosts, the Shop |
| [Towers, Areas and Goals](docs/gameplay/towers-areas-goals.md) | Higher towers, mastered and cleared areas, Goals and Warp |
| [Shrines](docs/gameplay/shrines.md) | Shrines and boons |

## How it's built

Two modes share one page: **Tower** (compact 17 × 17 puzzle floors, generated strategy-first like a Magic Tower) and **Delve** (one endless, wrapping labyrinth).
Worlds are generated deterministically from the run seed, and only your changes to them are saved.
The viewport shows 17 × 17 tiles with the entrance at the bottom center (20 × 20 in the forest outside); in the Delve, terrain below the last milestone gate can't be revisited.

Code lives in `src/`, with the Tower generator and its floors in `src/tower/`, the Delve labyrinth and its board in `src/delve/`, the Shop's offers, entitlements and transactions in `src/shop/`, Equipment (its catalogue, balance, inventory, recipes, effect slots, drops and Gem pulls) in `src/equipment/`, the Tournament's schedule, leagues, prizes, Tickets and server in `src/tournament/`, Mail (messages the server pushes, with items to claim) in `src/mail/`, the daily and weekly missions (their catalogue, rewards and saved state) in `src/missions/`, Events (fortnightly missions paying Medals toward relics, their schedule and saved state) in `src/events/`, Shrines and their boons (the Tower run's schedule, offers and boon effects) in `src/shrines.ts`, board drawing (the Renderer, terrain, lighting, the Game themes' boards, decor and effects) in `src/render/`, the sprites in `src/sprites/`, the enemies (curves, schedule, stage and traits) in `src/enemies/`, the cards, their trees, levels, buys and badges in `src/cards/`, the Archives, loadout, skill trees and Training in `src/progression/`, Gems, Gold bonuses and relics in `src/economy/`, the save, its decoder, settings and profile in `src/save/`, and the pages, HUD and dialogs in `src/ui/`.
Design documents are in `docs/`, and the gameplay rules in [docs/gameplay/](docs/gameplay/).
Architecture notes, generation invariants, and development commands for contributors (human or AI) are in [AGENTS.md](AGENTS.md), with each area's details in [docs/agents/](docs/agents/).

## Browser verification

The default PNG sprite kit shares one palette across the interface, characters, items, cards and terrain; non-default UI and Game themes take precedence in their own areas.
Its art guidelines and export tools are described in [UI sprites](docs/art/ui-sprites.md).

Start `npm run dev` in another terminal, then run `npm run test:browser`. See [docs/agents/testing.md](docs/agents/testing.md) for browser-channel and screenshot details.

## GitHub Pages

The included `.github/workflows/static.yml` installs dependencies, runs tests and the production build, then deploys **dist/** on pushes to `main` or manual workflow dispatch. In repository Settings → Pages, select **GitHub Actions** as the source. Vite uses relative asset paths for repository subpaths.

## Prototype boundaries

Room variety and balancing are introductory. Locked passages gate both ascent routes and reward branches; enemies inside chambers are often avoidable. Fights play out unless Animate fights is turned off. Automation prioritizes nearby upgrades and safe ascent, rather than globally optimal inventory planning. The Tower only climbs: a floor left behind can't be revisited in the run. Unsupported save-format versions reset safely. Layout-version migration retains progression, stats, and inventory, clears old map edits, and relocates the player to their current section entrance. All text uses the bundled variable Cinzel font from `assets/fonts/Cinzel/`; no remote font service is used. Weather is the only sound. The Archives' research is the only progression that runs while the game is closed; there is no cloud save or installable PWA.
