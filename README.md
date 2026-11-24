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

## Gameplay reference

The player-facing rules, in full, one topic a page:

| Page | What it covers |
|---|---|
| [How to play](docs/gameplay/how-to-play.md) | The game in brief: the hand, the currencies, ending a climb |
| [First steps](docs/gameplay/first-steps.md) | The first runs and their lessons, the Divine Portal, the tab bar and its dots, the forest and its sign, moving by hand, the Archives lesson |
| [The hand and cards](docs/gameplay/hand-and-cards.md) | The hand and every card, card levels, rarity, ascension and powers, the Deck page, pressing a card, Ignore and Target, Badges |
| [Upgrades](docs/gameplay/upgrades.md) | The skill trees' tabs, prices and help, Critical |
| [Gear and Equipment](docs/gameplay/gear-and-equipment.md) | Provisions, the Blacksmith and Equipment |
| [The Archives](docs/gameplay/archives.md) | Archivists, Rush, Cells and Speed Up, the library |
| [Skills and stats](docs/gameplay/skills-and-stats.md) | Shroud, potions, Silver and Gold skills, Free Training, Buy Quantity, Revive, Angel Wings, Thorns, Parry |
| [The Aether Shield](docs/gameplay/aether-shield.md) | The shield, its bar and bubble, regrowing, its training and research |
| [Fights](docs/gameplay/fights.md) | How a fight plays out, Fast, Ranged, Flying and Shielded monsters, the Archer, kill pay, fractions |
| [Floors](docs/gameplay/floors.md) | Bosses and Greater Bosses, doors and keys, the early floors, world wrap |
| [Floor Environments](docs/gameplay/environments.md) | Treasure, Golden and Stellar Floors, their research, the enemy stats box's Environments |
| [Training](docs/gameplay/training.md) | Silver, training for the run, XP and levels, the Training tab and trainers |
| [Proving Grounds](docs/gameplay/proving-grounds.md) | Three control modes, the Light Elemental, Keymaster, keys and mimics |
| [Runs](docs/gameplay/runs.md) | Movement settings, Phoenix Spark, how a run ends, Run Notes, rewards, the in-run controls, Dash |
| [Layout](docs/gameplay/layout.md) | Portrait and landscape, switching on wide screens, Handedness, Battery saver and its themes |
| [Cinematic mode](docs/gameplay/cinematic-mode.md) | The board alone: entering and leaving it, idle dimming, Gems in it |
| [Currencies and the Shop](docs/gameplay/currencies-and-shop.md) | Gems and Gem finds, the ad boosts, Offline Gold, the Shop, gifts |
| [Golden Scarabs and boosts](docs/gameplay/boosts.md) | Finding Golden Scarabs, the boosts they give, the boost table, their research |
| [Towers, Areas and Goals](docs/gameplay/towers-areas-goals.md) | Higher towers, mastered and cleared areas, Goals and Warp |
| [Shrines](docs/gameplay/shrines.md) | Shrines and boons |
| [The Codex](docs/gameplay/codex.md) | The in-game reference and its categories |
| [Arcana](docs/gameplay/arcana.md) | Arcanite's spells: buying and upgrading, each spell, in trials |
| [Familiars](docs/gameplay/familiars.md) | Medal-hatched beasts that help in climbs |
| [Sound](docs/gameplay/sound.md) | Sound effects, ambience, music and the Sounds settings |

## Project docs

| Page | What it covers |
|---|---|
| [How it's built](docs/project/how-its-built.md) | The two modes, saved worlds, and where the code lives |
| [Development](docs/project/development.md) | Browser tests and the GitHub Pages deploy |
| [Prototype boundaries](docs/project/prototype-boundaries.md) | What the prototype leaves simple or out |
| [AGENTS.md](AGENTS.md) | Commands, architecture and conventions for contributors, with each area in [docs/agents/](docs/agents/) |

## Design notes

| Note | What it covers |
|---|---|
| [Delve](docs/DELVE.md) | The endless labyrinth and its Automove |
| [Door and key schedule](docs/DOOR_AND_KEY_SCHEDULE.md) | How often each door and key appears, by tower and floor |
| [Enemy schedule](docs/ENEMY_SCHEDULE.md) | How many enemies a floor holds and how strong |
| [Progression and difficulty](docs/PROGRESSION_AND_DIFFICULTY.md) | The planned progression curve and its gates |
| [Research curves](docs/RESEARCH_CURVES.md) | Pricing long Archives research |
| [Equipment](docs/EQUIPMENT.md) | Equipment's design source of truth |
| [Crafting and equipment](docs/CRAFTING_AND_EQUIPMENT.md) | Retired: the crafting design Equipment replaced |
| [Shop](docs/SHOP.md) | The Shop's offers |
| [Missions](docs/MISSIONS.md) | Daily and weekly missions |
| [Events](docs/EVENTS.md) | Fortnightly events, Medals and relics |
| [Tournament](docs/TOURNAMENT.md) | The Tournament's plan |
| [Mail](docs/MAIL.md) | Mail's plan |
| [UI sprites](docs/art/ui-sprites.md), [UI atlas](docs/art/ui-atlas.md), [Sprite batches](docs/art/remaining-sprite-batches.md) | The sprite kit, its atlas and the art still to make |
